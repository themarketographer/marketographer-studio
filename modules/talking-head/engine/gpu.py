"""Dibujo de cada cuadro en la GPU de la Mac (Metal, vía MLX).

Hace lo mismo que el camino de CPU de render.py entre `apply_look` y `apply_vig`: zoom, color, filtros, brillo de película,
fondo desenfocado, mezcla con tu silueta, grano y viñeta. Son cuatro kernels que trabajan en un solo paso por píxel, así
que cada cuadro cuesta ~3 ms en vez de ~25 ms. Los textos y subtítulos se siguen dibujando en la CPU (son chicos).
Si algo no está disponible (sin MLX, medidas raras, un efecto que la GPU no hace), `frame` devuelve None y render.py usa la CPU.
"""
import math
import numpy as np
import cv2

try:
    import mlx.core as mx
    _OK = bool(mx.metal.is_available())
except Exception:  # sin MLX o sin Metal
    mx = None
    _OK = False

MAX_OPS = 12  # operaciones de filtro por cuadro que caben en los parámetros del kernel

_SRC_A = """
int x = (int)thread_position_in_grid.x, y = (int)thread_position_in_grid.y;
if (x >= W || y >= H) return;
float s = prm[0], cx = prm[1], cy = prm[2];
float sx = ((float)x - cx) / s + cx, sy = ((float)y - cy) / s + cy;
sx = clamp(sx, 0.0f, (float)(W - 1)); sy = clamp(sy, 0.0f, (float)(H - 1));
int x0 = (int)sx, y0 = (int)sy, x1 = metal::min(x0 + 1, W - 1), y1 = metal::min(y0 + 1, H - 1);
float fx = sx - (float)x0, fy = sy - (float)y0;
float o[3];
for (int c = 0; c < 3; c++) {
  float p00 = f[(y0 * W + x0) * 3 + c], p10 = f[(y0 * W + x1) * 3 + c], p01 = f[(y1 * W + x0) * 3 + c], p11 = f[(y1 * W + x1) * 3 + c];
  o[c] = mix(mix(p00, p10, fx), mix(p01, p11, fx), fy);
}
float av = mix(mix((float)al[y0 * W + x0], (float)al[y0 * W + x1], fx), mix((float)al[y1 * W + x0], (float)al[y1 * W + x1], fx), fy);
if (prm[3] > 0.5f) {  // contraste y brillo (tabla de 8 bits en CPU: aquí se trunca igual)
  for (int c = 0; c < 3; c++) o[c] = floor(clamp((o[c] - 128.0f) * prm[4] + 128.0f + prm[5], 0.0f, 255.0f));
}
if (prm[6] > 0.5f) {  // saturación como en HSV
  float mxv = metal::max(o[0], metal::max(o[1], o[2])), mnv = metal::min(o[0], metal::min(o[1], o[2]));
  if (mxv > 0.0f && mxv > mnv) {
    float S = (mxv - mnv) / mxv, S2 = metal::min(S * prm[7], 1.0f), k = S2 / S;
    for (int c = 0; c < 3; c++) o[c] = rint(mxv - (mxv - o[c]) * k);
  }
}
int nops = (int)prm[8];
if (nops > 0) {  // filtros de color (RGB 0-1), recortando después de cada operación
  float r = o[2] / 255.0f, g = o[1] / 255.0f, b = o[0] / 255.0f;
  for (int i = 0; i < nops; i++) {
    int base = 9 + i * 11; int t = (int)prm[base]; float v = prm[base + 1];
    if (t == 0) { r *= v; g *= v; b *= v; }
    else if (t == 1) { r = (r - 0.5f) * v + 0.5f; g = (g - 0.5f) * v + 0.5f; b = (b - 0.5f) * v + 0.5f; }
    else {
      float nr = prm[base + 2] * r + prm[base + 3] * g + prm[base + 4] * b;
      float ng = prm[base + 5] * r + prm[base + 6] * g + prm[base + 7] * b;
      float nb = prm[base + 8] * r + prm[base + 9] * g + prm[base + 10] * b;
      r = nr; g = ng; b = nb;
    }
    r = clamp(r, 0.0f, 1.0f); g = clamp(g, 0.0f, 1.0f); b = clamp(b, 0.0f, 1.0f);
  }
  o[2] = r * 255.0f; o[1] = g * 255.0f; o[0] = b * 255.0f;
}
for (int c = 0; c < 3; c++) fa[(y * W + x) * 3 + c] = (uchar)clamp(rint(o[c]), 0.0f, 255.0f);
aa[y * W + x] = (uchar)clamp(rint(av), 0.0f, 255.0f);
"""

# promedio de bloques K x K (igual que cv2.resize INTER_AREA cuando la medida es divisible)
_SRC_D = """
int x = (int)thread_position_in_grid.x, y = (int)thread_position_in_grid.y;
int w = W / K, h = H / K;
if (x >= w || y >= h) return;
float sum[3] = {0.0f, 0.0f, 0.0f}; float sa = 0.0f;
for (int j = 0; j < K; j++) for (int i = 0; i < K; i++) {
  int p = (y * K + j) * W + (x * K + i);
  sum[0] += f[p * 3]; sum[1] += f[p * 3 + 1]; sum[2] += f[p * 3 + 2]; sa += al[p];
}
float n = (float)(K * K);
for (int c = 0; c < 3; c++) sf[(y * w + x) * 3 + c] = sum[c] / n;
sm[y * w + x] = sa / n;
"""

# silueta a media resolución: promedio 2x2 y desenfoque horizontal gaussiano (sigma 1,5, radio 5): sigma 3 a tamaño completo
_SRC_H = """
int x = (int)thread_position_in_grid.x, y = (int)thread_position_in_grid.y;
int hw = W / 2, hh = H / 2;
if (x >= hw || y >= hh) return;
const float wt[11] = {0.001028f, 0.007599f, 0.036001f, 0.109361f, 0.213006f, 0.266012f, 0.213006f, 0.109361f, 0.036001f, 0.007599f, 0.001028f};
float acc = 0.0f;
for (int i = -5; i <= 5; i++) {
  int xx = metal::min(metal::max(x + i, 0), hw - 1);
  int p = (2 * y) * W + 2 * xx;
  acc += wt[i + 5] * 0.25f * ((float)al[p] + (float)al[p + 1] + (float)al[p + W] + (float)al[p + W + 1]);
}
tmp[y * hw + x] = acc;
"""

# brillo de película: vertical de la silueta + mezcla "pantalla" del brillo reducido
_SRC_B = """
int x = (int)thread_position_in_grid.x, y = (int)thread_position_in_grid.y;
if (x >= W || y >= H) return;
const float wt[11] = {0.001028f, 0.007599f, 0.036001f, 0.109361f, 0.213006f, 0.266012f, 0.213006f, 0.109361f, 0.036001f, 0.007599f, 0.001028f};
int hw = W / 2, hh = H / 2;
int hx = metal::min(x / 2, hw - 1), hy = y / 2;
float acc = 0.0f;
for (int j = -5; j <= 5; j++) {
  int yy = metal::min(metal::max(hy + j, 0), hh - 1);
  acc += wt[j + 5] * tmp[yy * hw + hx];
}
float libre = 255.0f - acc;
int gw = W / K, gh = H / K;
float gx = clamp(((float)x + 0.5f) / (float)K - 0.5f, 0.0f, (float)(gw - 1)), gy = clamp(((float)y + 0.5f) / (float)K - 0.5f, 0.0f, (float)(gh - 1));
int x0 = (int)gx, y0 = (int)gy, x1 = metal::min(x0 + 1, gw - 1), y1 = metal::min(y0 + 1, gh - 1);
float fx = gx - (float)x0, fy = gy - (float)y0;
for (int c = 0; c < 3; c++) {
  float g00 = glow[(y0 * gw + x0) * 3 + c], g10 = glow[(y0 * gw + x1) * 3 + c], g01 = glow[(y1 * gw + x0) * 3 + c], g11 = glow[(y1 * gw + x1) * 3 + c];
  float g = mix(mix(g00, g10, fx), mix(g01, g11, fx), fy) * 255.0f * libre / 255.0f;
  float f0 = fa[(y * W + x) * 3 + c];
  fb[(y * W + x) * 3 + c] = (uchar)clamp(rint(255.0f - (255.0f - f0) * (255.0f - g) / 255.0f), 0.0f, 255.0f);
}
"""

# fondo desenfocado: mezcla del cuadro con su versión borrosa (constante o con mapa de bordes)
_SRC_L = """
int x = (int)thread_position_in_grid.x, y = (int)thread_position_in_grid.y;
if (x >= W || y >= H) return;
int bw = W / K, bh = H / K;
float gx = clamp(((float)x + 0.5f) / (float)K - 0.5f, 0.0f, (float)(bw - 1)), gy = clamp(((float)y + 0.5f) / (float)K - 0.5f, 0.0f, (float)(bh - 1));
int x0 = (int)gx, y0 = (int)gy, x1 = metal::min(x0 + 1, bw - 1), y1 = metal::min(y0 + 1, bh - 1);
float fx = gx - (float)x0, fy = gy - (float)y0;
float w = prm[1] * (prm[0] > 1.5f ? edge[y * W + x] : 1.0f);
for (int c = 0; c < 3; c++) {
  float b00 = bl[(y0 * bw + x0) * 3 + c], b10 = bl[(y0 * bw + x1) * 3 + c], b01 = bl[(y1 * bw + x0) * 3 + c], b11 = bl[(y1 * bw + x1) * 3 + c];
  float b = metal::min(mix(mix(b00, b10, fx), mix(b01, b11, fx), fy) * prm[2], 255.0f);
  float f0 = fb[(y * W + x) * 3 + c];
  layer[(y * W + x) * 3 + c] = (uchar)clamp(rint(f0 * (1.0f - w) + b * w), 0.0f, 255.0f);
}
"""

# mezcla contigo + corrección de película + grano + viñeta
_SRC_C = """
int x = (int)thread_position_in_grid.x, y = (int)thread_position_in_grid.y;
if (x >= W || y >= H) return;
int p = y * W + x;
float al = (float)aa[p] / 255.0f;
float o[3];
for (int c = 0; c < 3; c++) {
  float f0 = fb[p * 3 + c];
  o[c] = prm[0] > 0.5f ? rint(f0 * al + (float)layer[p * 3 + c] * (1.0f - al)) : f0;
}
if (prm[1] > 0.5f) {  // look de película: tabla de color, "sobre mí" y grano
  for (int c = 0; c < 3; c++) {
    float gr = (float)lut[(int)clamp(o[c], 0.0f, 255.0f) * 3 + c];
    if (prm[2] < 0.5f) gr = rint(o[c] * al + gr * (1.0f - al));
    if (prm[3] >= 0.0f) {
      int hw = W / 2, hh = H / 2;
      float gx = clamp(((float)x + 0.5f) * 0.5f - 0.5f, 0.0f, (float)(hw - 1)), gy = clamp(((float)y + 0.5f) * 0.5f - 0.5f, 0.0f, (float)(hh - 1));
      int x0 = (int)gx, y0 = (int)gy, x1 = metal::min(x0 + 1, hw - 1), y1 = metal::min(y0 + 1, hh - 1);
      float fx = gx - (float)x0, fy = gy - (float)y0;
      int base = (int)prm[3] * hw * hh * 3;
      float pv = mix(mix((float)pos[base + (y0 * hw + x0) * 3 + c], (float)pos[base + (y0 * hw + x1) * 3 + c], fx), mix((float)pos[base + (y1 * hw + x0) * 3 + c], (float)pos[base + (y1 * hw + x1) * 3 + c], fx), fy);
      float nv = mix(mix((float)neg[base + (y0 * hw + x0) * 3 + c], (float)neg[base + (y0 * hw + x1) * 3 + c], fx), mix((float)neg[base + (y1 * hw + x0) * 3 + c], (float)neg[base + (y1 * hw + x1) * 3 + c], fx), fy);
      if (prm[2] < 0.5f) { float libre = 1.0f - al; pv *= libre; nv *= libre; }
      gr = clamp(gr + rint(pv), 0.0f, 255.0f) - rint(nv);
      gr = clamp(gr, 0.0f, 255.0f);
    }
    o[c] = gr;
  }
}
if (prm[4] > 0.5f) { float vm = (float)vig[p]; for (int c = 0; c < 3; c++) o[c] = rint(o[c] * vm / 255.0f); }
for (int c = 0; c < 3; c++) out[p * 3 + c] = (uchar)clamp(rint(o[c]), 0.0f, 255.0f);
"""

_K = {}


def disponible():
    return _OK


def _kernel(nombre, entradas, salidas, fuente):
    if nombre not in _K:
        _K[nombre] = mx.fast.metal_kernel(name=nombre, input_names=entradas, output_names=salidas, source=fuente)
    return _K[nombre]


def _lanzar(nombre, entradas, salidas, fuente, ins, grid, shapes, dtypes, **plantilla):
    k = _kernel(nombre, entradas, salidas, fuente)
    return k(inputs=ins, template=list(plantilla.items()), grid=(grid[0], grid[1], 1), threadgroup=(32, 8, 1), output_shapes=shapes, output_dtypes=dtypes)


class Gpu:
    """Estado del dibujo en GPU para un render: tablas, máscaras y texturas fijas que se suben una sola vez."""

    def __init__(self, W, H, peli, look, vmask, modo_bl, edge_fn):
        """look: (c, b, sat) del estilo. vmask: máscara de viñeta (uint8, HxWx3) o None. modo_bl: modo del fondo desenfocado.
        edge_fn(): devuelve el mapa de bordes float32 HxW (se pide solo si se usa)."""
        self.W, self.H, self.peli, self.modo_bl = W, H, peli, modo_bl
        c, b, sat = look
        self.look = [1.0 if (abs(c - 1) > 0.01 or abs(b) > 0.5) else 0.0, c, b, 1.0 if abs(sat - 1) > 0.01 else 0.0, sat]
        self.vm = mx.array(np.ascontiguousarray(vmask[:, :, 0])) if vmask is not None else mx.zeros((1,), mx.uint8)
        self.has_vm = vmask is not None
        self.edge_fn, self.edge = edge_fn, None
        self.lut = mx.array(np.ascontiguousarray(peli.lut.reshape(256, 3))) if peli.on else mx.zeros((3,), mx.uint8)
        self.pos = self.neg = mx.zeros((1,), mx.uint8)
        self.n_pool = 0
        if peli.on and peli.pool:
            self.n_pool = len(peli.pool)
            self.pos = mx.array(np.stack([p[0] for p in peli.pool]))
            self.neg = mx.array(np.stack([p[1] for p in peli.pool]))
        self.ok = (W % 8 == 0 and H % 8 == 0 and W % 6 == 0 and H % 6 == 0 and W % 2 == 0 and H % 2 == 0)

    def _eval(self, *arrs):
        mx.eval(*arrs)

    def frame(self, f, a, s, cx, cy, ops, w_, osc, back_cb):
        """Un cuadro. f: BGR uint8, a: máscara uint8, s: zoom (1 = sin zoom), ops: filtros activos [(tipo, valor, matriz)],
        w_/osc: desenfoque de fondo (w_=0: ninguno), back_cb(layer_uint8) -> layer (dibuja los textos de detrás de ti) o None.
        Devuelve el cuadro BGR uint8, o None si hay que usar la CPU."""
        W, H, peli = self.W, self.H, self.peli
        if not self.ok or len(ops) > MAX_OPS:
            return None
        prm = np.zeros(9 + MAX_OPS * 11, np.float32)
        prm[0:3] = (s if s > 1.001 else 1.0, cx, cy)
        prm[3], prm[4], prm[5], prm[6], prm[7] = self.look
        prm[8] = len(ops)
        for i, (t, v, m) in enumerate(ops):
            prm[9 + i * 11] = t
            prm[10 + i * 11] = v
            if m is not None:
                prm[11 + i * 11:20 + i * 11] = np.asarray(m, np.float32).reshape(9)
        mf, ma = mx.array(f), mx.array(a)
        fa, aa = _lanzar("estudio_a", ["f", "al", "prm"], ["fa", "aa"], _SRC_A, [mf, ma, mx.array(prm)], (W, H),
                         [(H, W, 3), (H, W)], [mx.uint8, mx.uint8], W=W, H=H)
        fb = fa
        if peli.on and (peli.bloom >= 0.02 or peli.hal >= 0.02):
            sf, sm = _lanzar("estudio_d", ["f", "al"], ["sf", "sm"], _SRC_D, [fa, aa], (W // 8, H // 8),
                             [(H // 8, W // 8, 3), (H // 8, W // 8)], [mx.float32, mx.float32], W=W, H=H, K=8)
            tmp = _lanzar("estudio_h", ["al"], ["tmp"], _SRC_H, [aa], (W // 2, H // 2), [(H // 2, W // 2)], [mx.float32], W=W, H=H)[0]
            self._eval(sf, sm)
            small = np.rint(np.array(sf)).astype(np.uint8)
            am = np.rint(np.array(sm)).astype(np.uint8)
            glow = peli.glow_pequeno(small, am).astype(np.float32)
            fb = _lanzar("estudio_b", ["fa", "tmp", "glow"], ["fb"], _SRC_B, [fa, tmp, mx.array(glow)], (W, H), [(H, W, 3)], [mx.uint8], W=W, H=H, K=8)[0]
        layer, usa_layer = fb, 0.0
        if w_ > 0.01:
            sf6 = _lanzar("estudio_d", ["f", "al"], ["sf", "sm"], _SRC_D, [fb, aa], (W // 6, H // 6),
                          [(H // 6, W // 6, 3), (H // 6, W // 6)], [mx.float32, mx.float32], W=W, H=H, K=6)[0]
            self._eval(sf6)
            small = np.rint(np.array(sf6)).astype(np.uint8)
            small = cv2.GaussianBlur(small, (0, 0), 4.2).astype(np.float32)
            modo = 2.0 if self.modo_bl == "bordes" else 1.0
            if modo == 2.0 and self.edge is None:
                self.edge = mx.array(np.ascontiguousarray(self.edge_fn().astype(np.float32)))
            layer = _lanzar("estudio_l", ["fb", "bl", "edge", "prm"], ["layer"], _SRC_L,
                            [fb, mx.array(small), self.edge if modo == 2.0 else mx.zeros((1,), mx.float32), mx.array(np.array([modo, w_, osc], np.float32))],
                            (W, H), [(H, W, 3)], [mx.uint8], W=W, H=H, K=6)[0]
            usa_layer = 1.0
        if back_cb is not None:
            self._eval(layer)
            nuevo = back_cb(np.array(layer))
            layer, usa_layer = mx.array(nuevo), 1.0
        grano = -1.0
        if peli.on and self.n_pool:
            grano = float(peli.n % self.n_pool)
            peli.n += 1
        elif peli.on and peli.pool:
            peli.n += 1
        pc = np.array([usa_layer, 1.0 if peli.on else 0.0, 1.0 if peli.sobre_mi else 0.0, grano, 1.0 if self.has_vm else 0.0], np.float32)
        out = _lanzar("estudio_c", ["fb", "layer", "aa", "lut", "pos", "neg", "vig", "prm"], ["out"], _SRC_C,
                      [fb, layer, aa, self.lut, self.pos, self.neg, self.vm, mx.array(pc)], (W, H), [(H, W, 3)], [mx.uint8], W=W, H=H)[0]
        self._eval(out)
        return np.array(out)
