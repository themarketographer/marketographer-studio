"""Renderiza el video: desenfoque del fondo, títulos detrás de ti, subtítulos, zooms, imagen y sonidos."""
import math, queue, re, subprocess, threading
from functools import lru_cache
from pathlib import Path
import cv2, numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageFilter
from common import FONTS, correr_tramos, ffmpeg_exe, encoder_args, hilos_auto, load, probe, status, merge_style, formato_de, encuadre_de, cuadro_cover, encuadrar, par
import plan as planmod
import cuts as cutmod
import audio as audiomod
import sfx
import unicodedata
import graficos as graf
import filtros

SIZE_FRAC = {"S": 0.40, "M": 0.60, "L": 0.78, "XL": 0.92}
SUB_SIZE = {"S": 0.030, "M": 0.038, "L": 0.047, "XL": 0.058}
POS_Y = {"detras": 0.19, "arriba": 0.17, "centro": 0.53, "abajo": 0.62}
DETRAS = ("detras", "arriba")  # se dibujan debajo de ti, sobre el fondo desenfocado


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease_out(u):
    return 1 - (1 - u) ** 3


def ease_in_out(u):
    return u * u * (3 - 2 * u)


def ease_back(u):
    c = 2.2
    return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# ---------------------------------------------------------------- texto

@lru_cache(maxsize=256)
def get_font(name, px):
    return ImageFont.truetype(str(FONTS / name), max(int(px), 6))


def tw(font, text, tr):
    """Ancho del texto con interletrado (tr en píxeles)."""
    if not text:
        return 0.0
    if not tr:
        return font.getlength(text)
    return sum(font.getlength(c) for c in text) + tr * len(text)


def draw_word(d, x, base, text, font, tr, stroke=0):
    if not tr:
        d.text((x, base), text, font=font, fill=255, anchor="ls", stroke_width=stroke, stroke_fill=255)
        return
    for c in text:
        d.text((x, base), c, font=font, fill=255, anchor="ls", stroke_width=stroke, stroke_fill=255)
        x += font.getlength(c) + tr


def line_width(line, px, tr):
    sp = get_font(line[0][1], px).getlength(" ") + tr
    return sum(tw(get_font(fn, px), t, tr) for t, fn, _ in line) + sp * (len(line) - 1)


def render_runs(lines, px, tr_em, glow, outline, sombra=1.0):
    """lines: lista de líneas; cada línea es una lista de (texto, fuente, color rgb). Devuelve (BGR, alfa)."""
    tr = tr_em * px
    widths = [line_width(l, px, tr) for l in lines]
    pad = int(px * 0.5)
    lh = int(px * 1.12)
    cw, ch = int(max(widths)) + 2 * pad, lh * len(lines) + 2 * pad
    masks = {}
    sw = int(round(px * 0.07 * outline)) if outline > 0.02 else 0
    outl = Image.new("L", (cw, ch), 0)
    od = ImageDraw.Draw(outl)
    for li, line in enumerate(lines):
        capH = -get_font(line[0][1], px).getbbox("H", anchor="ls")[1]
        base = pad + li * lh + (lh + capH) / 2
        x = (cw - widths[li]) / 2
        sp = get_font(line[0][1], px).getlength(" ") + tr
        for t, fn, col in line:
            f = get_font(fn, px)
            m = masks.setdefault(col, Image.new("L", (cw, ch), 0))
            draw_word(ImageDraw.Draw(m), x, base, t, f, tr)
            if sw and len(col) == 3:  # una palabra apagada (4º valor = opacidad) no lleva contorno
                draw_word(od, x, base, t, f, tr, sw)
            x += tw(f, t, tr) + sp
    for col in [k for k in masks if len(k) == 4]:  # palabras apagadas: misma máscara, menos opacidad
        k = col[3]
        dim = masks.pop(col).point(lambda v: int(v * k))
        masks[col[:3]] = ImageChops.lighter(masks[col[:3]], dim) if col[:3] in masks else dim
    allm = None
    for m in masks.values():
        allm = m if allm is None else ImageChops.lighter(allm, m)
    base_mask = outl if sw else allm
    shadow = Image.new("L", (cw, ch), 0)
    shadow.paste(base_mask, (0, int(px * 0.04)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(px * 0.05)).point(lambda v: int(v * 0.55 * sombra))
    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))

    def put(mask, col):
        layer = Image.new("RGBA", (cw, ch), tuple(col) + (0,))
        layer.putalpha(mask)
        return Image.alpha_composite(canvas, layer)

    canvas = put(shadow, (0, 0, 0))
    if sw:
        canvas = put(outl, (0, 0, 0))
    if glow > 0.02:
        ga = min(1.0, glow * 1.2)
        for col, m in masks.items():
            canvas = put(m.filter(ImageFilter.GaussianBlur(px * (0.05 + 0.06 * glow))).point(lambda v: int(v * ga)), col)
    for col, m in masks.items():
        canvas = put(m, col)
    arr = np.array(canvas)
    return cv2.cvtColor(arr[:, :, :3], cv2.COLOR_RGB2BGR), arr[:, :, 3].copy()


def split_lines(items, max_len=None):
    """Una línea para 1 o 2 palabras, dos líneas equilibradas para 3 o más."""
    if len(items) < 3:
        return [items]
    mid = len(items) // 2 + len(items) % 2
    return [items[:mid], items[mid:]]


def title_sprite(ev, style, W, H, colors):
    base = style["font"]
    emph = style["emphFont"] or base
    c_base = colors["accent" if ev.get("color") == "accent" else "text"]
    c_alt = colors["text" if ev.get("color") == "accent" else "accent"]
    items = []
    for tk in caso_texto(ev["text"], style.get("titulosCaso", "mayus")).split():
        e = len(tk) > 2 and tk.startswith("*") and tk.endswith("*")
        w = tk.strip("*")
        items.append((w, emph if e else base, c_alt if e else c_base))
    lines = split_lines(items)
    w200 = max(line_width(l, 200, style["tracking"] * 200) for l in lines)
    px = min(200 * SIZE_FRAC.get(ev.get("size", "L"), 0.7) * W / max(w200, 1), 0.17 * H)
    if ev.get("pxf"):  # tamaño fijo en proporción al alto (listas, conexiones, gráficos)
        px = min(ev["pxf"] * H, 200 * 0.9 * W / max(w200, 1))
    return render_runs(lines, max(px, 16), style["tracking"], style["glow"], style["contorno"], float(style.get("sombra", 1.0)))


def with_box(bgr, a, px):
    pad = int(px * 0.32)
    h, w = a.shape
    box = Image.new("L", (w + 2 * pad, h + 2 * pad), 0)
    ImageDraw.Draw(box).rounded_rectangle((0, 0, box.width - 1, box.height - 1), radius=int(px * 0.4), fill=150)
    nb = np.zeros((box.height, box.width, 3), np.uint8)
    na = np.array(box)
    af = a.astype(np.float32) / 255.0
    ba = na[pad:pad + h, pad:pad + w].astype(np.float32) / 255.0
    oa = af + ba * (1 - af)
    region = nb[pad:pad + h, pad:pad + w].astype(np.float32)
    nb[pad:pad + h, pad:pad + w] = np.clip((bgr.astype(np.float32) * af[..., None]) / np.maximum(oa[..., None], 1e-3), 0, 255).astype(np.uint8)
    na[pad:pad + h, pad:pad + w] = (np.clip(oa, 0, 1) * 255).astype(np.uint8)
    return nb, na


def caso_texto(t, caso):
    """mayus = TODO EN MAYÚSCULAS, minus = todo en minúsculas, tal = como se dijo (en títulos, solo la primera letra en mayúscula)."""
    if caso == "mayus":
        return t.upper()
    if caso == "minus":
        return t.lower()
    low = t.lower()
    for i, ch in enumerate(low):
        if ch.isalpha():
            return low[:i] + ch.upper() + low[i + 1:]
    return low


def _nz(s):
    s = unicodedata.normalize("NFD", s.lower())
    return re.sub(r"[^a-z0-9ñ]", "", "".join(c for c in s if unicodedata.category(c) != "Mn" or c == "\u0303"))


def palabras_en_grande(events, t):
    """Títulos que están en pantalla en este momento: (palabras, desde, hasta). Sirve para no repetir esas palabras en el subtítulo."""
    out = []
    for e in events:
        if e.get("kind") or not (e["start"] - 0.4 <= t < e["end"]):
            continue
        txt = e["text"].split("|")[-1]
        out.append(({_nz(w) for w in txt.replace("*", " ").split() if _nz(w)}, e["start"] - 0.4, e["end"] + 0.1))
    return out


def sub_sprite(chunk, activo, style, W, H, colors, ocultas=(), tenues=(), pulsan=()):
    """Subtítulo del bloque. Por defecto sale completo. 'ocultas' quita palabras (modo viejo) y 'tenues' las deja en su lugar, apagadas."""
    s = style["subs"]
    base = s["font"] or style["font"]
    emph = s["emphFont"] or base
    acc, txt = colors["accent"], colors["text"]
    items = []
    visibles = [i for i in range(len(chunk["words"])) if i not in ocultas]
    if activo not in visibles:
        previos = [i for i in visibles if i < activo]
        activo = previos[-1] if previos else (visibles[0] if visibles else 0)
    for i in visibles:
        wd = chunk["words"][i]
        clave = s["claves"] and wd["key"]
        act = s["resalte"] == "palabra" and i == activo
        col = acc if (clave or act or i in pulsan) else txt
        if i in tenues:
            col = tuple(col)[:3] + (0.3,)
        items.append((wd["t"], emph if clave else base, col))
    px = H * SUB_SIZE.get(s["size"], 0.038)
    tr = s["tracking"]
    lines = [items]
    if line_width(items, px, tr * px) > 0.88 * W and len(items) > 1:
        lines = split_lines(items) if len(items) > 2 else [items[:1], items[1:]]
    w = max(line_width(l, px, tr * px) for l in lines)
    if w > 0.88 * W:
        px *= 0.88 * W / w
    bgr, a = render_runs(lines, px, s["tracking"], s["glow"], s["contorno"])
    return with_box(bgr, a, px) if s["caja"] else (bgr, a)


FINAL_DEBIL = set("no ni a al el la los las un una unos unas de del en con por para que y e o u pero porque como se su sus mi mis tu tus lo le les me te nos muy mas sin sobre entre hasta desde cuando donde es son".split())
INICIO_BUENO = set("y e o pero porque que cuando donde para con si como aunque entonces pues sino".split())


def _nk(w):
    t = unicodedata.normalize("NFD", w.lower())
    return re.sub(r"[^a-z0-9ñ]", "", "".join(c for c in t if unicodedata.category(c) != "Mn"))


RUIDO = re.compile(r"(?i)(e+h+m*|e+m+|h?m{2,}|u+h+m*)")  # eh, mm, hmm: se oyen pero no se escriben en pantalla
AUXILIARES = set("ha he has han hemos voy vas va vamos van estoy estamos puedo puede pueden quiero quiere tengo tiene tienen debo debe hay ni no tan tanto menos mas".split())
AUTONOMAS = set("si no mira ojo bueno pues claro exacto listo ahora entonces hola gracias atencion ok ya vale jamas nunca siempre mentira verdad".split())


def _cap(t):
    t = re.sub(r"^[¿¡(«\"']+", "", t)
    return bool(t) and t[0].isupper()


def _autonoma(ws, j):
    """Una palabra suelta que puede ir sola en pantalla: interjecciones, respuestas, cifras con su signo."""
    w = ws[j]["w"].strip()
    k = _nk(w)
    cierra = bool(re.search(r"[,.!?;:…]$", w)) or (j + 1 < len(ws) and ws[j + 1]["start"] - ws[j]["end"] >= 0.25)
    return cierra and (k in AUTONOMAS or bool(re.search(r"\d", w)))


def partir_grupo(ws, maxPal):
    """Parte un grupo largo en bloques de hasta maxPal palabras, cortando donde termina una idea:
    nunca después de un artículo, preposición o auxiliar, no entre dos nombres propios ni entre una cifra y lo que cuenta,
    de preferencia después de una coma, antes de una conjunción o en una pausa. Algunas palabras pueden ir solas."""
    n = len(ws)
    if n <= maxPal:
        return [ws]

    def corte(i):  # costo de cortar entre ws[i-1] y ws[i]
        a, b = ws[i - 1]["w"].strip(), ws[i]["w"].strip()
        ka, kb = _nk(a), _nk(b)
        c = 0.0
        if ka in FINAL_DEBIL:
            c += 6
        elif ka in AUXILIARES:
            c += 4
        if kb in INICIO_BUENO:
            c -= 2
        if re.search(r"\d$", a) and not re.search(r"[,.!?;:]$", a):
            c += 3
        if _cap(a) and _cap(b) and i - 2 >= 0 and not re.search(r"[.?!]$", ws[i - 2]["w"].strip()):
            c += 5
        if re.search(r",$", a):
            c -= 3
        c -= min(max(ws[i]["start"] - ws[i - 1]["end"], 0), 0.5) * 6
        return c

    def tamano(j, i):  # castigo por bloques cortos; una palabra autónoma puede ir sola sin castigo
        if i - j == 1 and _autonoma(ws, j):
            return 0.0
        return 0.15 * (maxPal - (i - j)) ** 2

    inf = float("inf")
    dp, prev = [inf] * (n + 1), [0] * (n + 1)
    dp[0] = 0.0
    for i in range(1, n + 1):
        for j in range(max(0, i - maxPal), i):
            if dp[j] == inf:
                continue
            tam = i - j
            c = dp[j] + 0.5 + tamano(j, i) + (corte(i) if i < n else 0)
            if c < dp[i]:
                dp[i], prev[i] = c, j
    out, i = [], n
    while i > 0:
        out.append(ws[prev[i]:i])
        i = prev[i]
    return out[::-1]


def build_chunks(words, maxPal, caso, pausa=0.4):
    """Los bloques siguen las ideas: se cortan en puntos, comas, dos puntos y pausas. Si una idea es larga, se parte en el mejor punto."""
    grupos, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        sig = words[i + 1]["start"] - w["end"] if i + 1 < len(words) else 99
        t = w["w"].strip()
        if sig >= pausa or re.search(r"[.?!;:…]$", t) or (re.search(r",$", t) and (len(cur) >= 2 or sig >= 0.2)):
            grupos.append(cur)
            cur = []
    if cur:
        grupos.append(cur)
    chunks = [p for g in grupos for p in partir_grupo(g, max(int(maxPal), 1))]
    out = []
    for ch in chunks:
        ws = []
        for w in ch:
            t = re.sub(r"[.,;:]+$", "", w["w"].strip())
            t = t if caso == "tal" else caso_texto(t, caso)
            if t and not RUIDO.fullmatch(re.sub(r"[¿¡.,;:!?…]", "", t)):
                ws.append({"t": t, "start": w["start"], "end": w["end"], "key": planmod.puntaje(planmod.limpia(w["w"])) >= 7})
        if ws:
            out.append({"words": ws, "start": max(0.0, ws[0]["start"] - 0.05), "end": ws[-1]["end"] + 0.22})
    for a, b in zip(out, out[1:]):
        a["end"] = min(a["end"], b["start"]) if b["start"] - a["end"] < 0.3 else a["end"]
    return out


# ---------------------------------------------------------------- movimiento

def blit(dst, rgb, a, cx, cy, amul):
    h, w = a.shape
    x0, y0 = int(cx - w / 2), int(cy - h / 2)
    X0, Y0 = max(x0, 0), max(y0, 0)
    X1, Y1 = min(x0 + w, dst.shape[1]), min(y0 + h, dst.shape[0])
    if X1 <= X0 or Y1 <= Y0:
        return
    sa = a[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0].astype(np.float32)[..., None] * (amul / 255.0)
    roi = dst[Y0:Y1, X0:X1].astype(np.float32)
    dst[Y0:Y1, X0:X1] = (roi * (1 - sa) + rgb[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0].astype(np.float32) * sa).astype(np.uint8)


def anim_state(ev, t):
    d, dur, tail = t - ev["start"], max(ev["end"] - ev["start"], 0.2), ev["end"] - t
    alpha = clamp(d / 0.12) * clamp(tail / 0.15)
    sc, dx, dy, reveal, squash = 1 + 0.03 * clamp(d / dur), 0.0, 0.0, 1.0, 1.0
    kind = ev.get("anim", "pop")
    if kind in ("pop", "ruleta"):
        u = clamp(d / 0.22)
        sc *= (0.7 + 0.4 * ease_out(u / 0.55)) if u < 0.55 else (1.1 - 0.1 * ease_out((u - 0.55) / 0.45))
    elif kind == "deslizar":
        dy = (1 - ease_out(clamp(d / 0.3))) * 0.045
    elif kind == "escribir":
        reveal = clamp(d / min(0.4, dur * 0.5))
    elif kind == "fade":
        alpha = clamp(d / 0.3) * clamp(tail / 0.2)
    elif kind == "bajar":
        dy = -(1 - ease_out(clamp(d / 0.3))) * 0.05
    elif kind == "crecer":
        sc *= 1.7 - 0.7 * ease_out(clamp(d / 0.28))
    elif kind == "rebote":
        u = clamp(d / 0.6)
        sc *= 1 - math.exp(-6 * u) * math.cos(14 * u) * 0.35
    elif kind == "elastico":
        u = clamp(d / 1.0)
        wob = math.exp(-5.5 * u) * math.cos(19 * u)
        squash = 1 + 0.34 * wob
        sc *= 1 - 0.1 * wob
        alpha = clamp(d / 0.06) * clamp(tail / 0.15)
    elif kind == "tiembla":
        k = max(0.0, 1 - d / 0.3)
        dx, dy = math.sin(d * 90) * 0.012 * k, math.cos(d * 120) * 0.01 * k
    sc *= 1 - 0.04 * (1 - clamp(tail / 0.15))
    return sc, alpha, dx, dy, reveal, squash


ZOOM_ESTILO = {"suave": (0.5, ease_in_out), "normal": (0.22, ease_out), "punch": (0.14, ease_back)}


def zoom_scale(zooms, t, estilo, deriva):
    prev, cur, t0 = 1.0, 1.0, -9
    for z in zooms:
        if z["t"] <= t:
            prev, cur, t0 = cur, z["level"], z["t"]
        else:
            break
    dur, curve = ZOOM_ESTILO.get(estilo, ZOOM_ESTILO["normal"])
    s = prev + (cur - prev) * curve(clamp((t - t0) / dur))
    if deriva and cur > 1.001:
        s *= 1 + 0.025 * clamp((t - t0) / 4.0)
    return s


def make_look(style, W, H):
    im = style["imagen"]
    c, b, sat, vig = float(im["contraste"]), float(im["brillo"]), float(im["saturacion"]), float(im["vineta"])
    lut = None
    if abs(c - 1) > 0.01 or abs(b) > 0.5:
        x = np.arange(256, dtype=np.float32)
        lut = np.clip((x - 128) * c + 128 + b, 0, 255).astype(np.uint8)
    bloom, deg = float(im.get("bloom", 0)), float(im.get("degradado", 0))
    vmask = None
    if vig > 0.01 or deg > 0.01:
        v = np.ones((H, W), np.float32)
        if vig > 0.01:
            yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
            r_ = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H * 0.45) / (H * 0.62)) ** 2)
            v *= 1 - vig * 0.8 * np.clip(r_ - 0.5, 0, 1) ** 1.5
        if deg > 0.01:  # degradado suave a negro arriba y abajo, para que el texto se lea sobre fondos claros
            y = np.linspace(0, 1, H, dtype=np.float32)[:, None]
            ramp = np.clip((y - 0.62) / 0.38, 0, 1) ** 1.3 + np.clip((0.22 - y) / 0.22, 0, 1) ** 1.3 * 0.7
            v *= 1 - deg * 0.65 * ramp
        vmask = cv2.merge([(v * 255).astype(np.uint8)] * 3)

    def apply(f):
        if lut is not None:
            f = cv2.LUT(f, lut)
        if abs(sat - 1) > 0.01:
            hsv = cv2.cvtColor(f, cv2.COLOR_BGR2HSV)
            hsv[:, :, 1] = np.clip(hsv[:, :, 1].astype(np.float32) * sat, 0, 255).astype(np.uint8)
            f = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
        return f

    def viñeta(out):
        return cv2.multiply(out, vmask, scale=1 / 255.0) if vmask is not None else out

    return apply, viñeta


def _suave(img, sigma):
    """Desenfoque gaussiano barato: un desenfoque grande se hace sobre una copia reducida y se vuelve a ampliar; el resultado es el mismo de suave y mucho más rápido."""
    k = 1
    while sigma / (k * 2) >= 3.0:
        k *= 2
    if k == 1:
        return cv2.GaussianBlur(img, (0, 0), sigma)
    h, w = img.shape[:2]
    pq = cv2.resize(img, (max(w // k, 2), max(h // k, 2)), interpolation=cv2.INTER_AREA)
    pq = cv2.GaussianBlur(pq, (0, 0), sigma / k)
    return cv2.resize(pq, (w, h), interpolation=cv2.INTER_LINEAR)


class Pelicula:
    """Look de película: brillo sobre las luces del fondo (nunca sobre la persona), halación cálida, grano, negros levantados y calidez."""

    def __init__(self, style, W, H):
        p = style["pelicula"]
        self.on = bool(p.get("on"))
        self.W, self.H = W, H
        self.bloom, self.umbral = float(p["bloom"]), float(p["umbral"])
        self.tam, self.hal = float(p["tamano"]), float(p["halacion"])
        self.grano, self.fade, self.cal = float(p["grano"]), float(p["desvanecido"]), float(p["calidez"])
        self.sobre_mi = bool(p.get("sobreMi", True))
        self.n = 0
        if not self.on:
            return
        x = np.arange(256, dtype=np.float32) / 255.0
        base = x + 0.18 * (x - 0.5) * (1 - np.abs(2 * x - 1))  # curva en S suave, como el negativo de cine
        lift = self.fade * 0.11
        ch = []
        for gain in (1 - 0.14 * self.cal, 1 - 0.01 * self.cal, 1 + 0.07 * self.cal):  # B, G, R
            y = np.clip(lift + base * (1 - lift * 0.9), 0, 1) * gain
            ch.append(np.clip(y * 255, 0, 255).astype(np.uint8))
        self.lut = np.stack(ch, axis=1).reshape(256, 1, 3)
        self.pool = None
        if self.grano > 0.01:
            rng = np.random.default_rng(7)
            self.pool = []
            for _ in range(8):
                nz = rng.normal(0, 1, (max(H // 2, 8), max(W // 2, 8))).astype(np.float32) * (self.grano * 16)
                nz = cv2.GaussianBlur(nz, (0, 0), 0.6)
                pos, neg = np.clip(nz, 0, 255).astype(np.uint8), np.clip(-nz, 0, 255).astype(np.uint8)
                self.pool.append((cv2.merge([pos] * 3), cv2.merge([neg] * 3)))

    def fondo(self, f, a):
        """Niebla de luz estilo película: las luces del fondo se desparraman en tres radios, con un velo suave que levanta las sombras. Nunca cae sobre la persona."""
        if not self.on or (self.bloom < 0.02 and self.hal < 0.02):
            return f
        W, H = self.W, self.H
        sw, sh = max(W // 4, 8), max(H // 4, 8)
        sm = cv2.resize(f, (sw, sh), interpolation=cv2.INTER_AREA)
        am = cv2.resize(a, (sw, sh), interpolation=cv2.INTER_AREA)
        am = cv2.dilate(am, np.ones((5, 5), np.uint8))
        fuera = 1 - am.astype(np.float32) / 255.0
        smf = sm.astype(np.float32) / 255.0
        luz = smf.max(axis=2)  # el brillo de la luz más fuerte de cada canal, así una llama naranja también cuenta
        u = min(self.umbral, 0.9)
        hi = np.clip((luz - u * 0.62) / max(1 - u * 0.62, 0.08), 0, 1)
        hi = hi * hi * (3 - 2 * hi)  # umbral suave, sin bordes duros
        col = smf * hi[..., None] * fuera[..., None]
        t = self.tam
        g1 = _suave(col, sw * (0.012 + 0.03 * t))
        g2 = _suave(col, sw * (0.05 + 0.09 * t))
        g3 = _suave(col, sw * (0.13 + 0.22 * t))
        warm = np.array([0.62, 0.86, 1.0], np.float32)  # BGR: ámbar suave en el halo ancho
        glow = g1 * 0.55 + g2 * 0.9 + g3 * 1.5 * warm
        glow = glow * (self.bloom * 2.3)
        if self.hal > 0.02:  # halación: el halo ancho se tiñe de rojo anaranjado, como luz que atraviesa la película
            gray = (g2 + g3).mean(axis=2, keepdims=True)
            glow = glow + gray * np.array([0.10, 0.40, 1.0], np.float32) * self.hal * 2.4
        # velo de difusión: todo el fondo se suaviza un poco y las sombras se levantan
        veil = _suave(smf * fuera[..., None], sw * 0.06) * (self.bloom * 0.4)
        glow = np.clip(glow + veil, 0, 1.5)
        glow = np.clip(glow, 0, 1)
        libre = 255 - _suave(a, 3.0)
        # La mezcla "pantalla" se hace en 8 bits y a tamaño completo solo al final: es lo que más pesaba.
        glow8 = cv2.resize((glow * 255).astype(np.uint8), (W, H), interpolation=cv2.INTER_LINEAR)
        glow8 = cv2.multiply(glow8, cv2.merge([libre] * 3), scale=1 / 255.0)
        return 255 - cv2.multiply(255 - f, 255 - glow8, scale=1 / 255.0)

    def global_(self, out, a):
        if not self.on:
            return out
        graded = cv2.LUT(out, self.lut)
        if not self.sobre_mi:
            a3 = cv2.merge([a, a, a])
            graded = cv2.add(cv2.multiply(out, a3, scale=1 / 255.0), cv2.multiply(graded, cv2.bitwise_not(a3), scale=1 / 255.0))
        if self.pool:
            pos, neg = self.pool[self.n % len(self.pool)]
            self.n += 1
            pos, neg = cv2.resize(pos, (self.W, self.H)), cv2.resize(neg, (self.W, self.H))
            if not self.sobre_mi:
                libre = cv2.merge([cv2.bitwise_not(a)] * 3)
                pos, neg = cv2.multiply(pos, libre, scale=1 / 255.0), cv2.multiply(neg, libre, scale=1 / 255.0)
            graded = cv2.subtract(cv2.add(graded, pos), neg)
        return graded


def ensure_proxy(proj, medio=False):
    """Copia ligera del video para que las vistas previas vayan rápido. medio=True deja la mitad del tamaño (más nítida)."""
    px = Path(proj) / ("proxy2.mp4" if medio else "proxy.mp4")
    if px.exists():
        return px
    status(proj, "render", 1, "Preparando la versión ligera (solo la primera vez)")
    tmp = Path(proj) / "_proxy.mp4"
    esc = "scale=trunc(iw/2/2)*2:trunc(ih/2/2)*2" if medio else "scale=trunc(iw/4)*2:trunc(ih/4)*2"
    subprocess.run([ffmpeg_exe(), "-v", "error", "-y", "-i", str(Path(proj) / "source.mp4"), "-vf", esc,
                    "-an", *encoder_args("medio"), "-g", "15", "-pix_fmt", "yuv420p", str(tmp)], check=True)
    tmp.replace(px)
    return px


def reader(cap, acap, segs, W, H, q, fmt="9x16", fx=0.5, fy=0.4):
    """Lee video y recorte por adelantado en otro hilo. segs: lista de (frame_inicio, frame_fin, indice_del_tramo) que se conservan."""
    pos = None
    for a0, a1, si in segs:
        if pos != a0:
            for c in (cap, acap):
                c.set(cv2.CAP_PROP_POS_FRAMES, a0)
        pos = a0
        for fi in range(a0, a1):
            ok, f = cap.read()
            if not ok:
                q.put(None)
                return
            ok2, a = acap.read()
            pos += 1
            f = encuadrar(f, fmt, fx, fy)  # si el original tiene otra proporción, se recorta en vez de estirarse
            if f.shape[1] != W or f.shape[0] != H:
                f = cv2.resize(f, (W, H), interpolation=cv2.INTER_AREA)
            a = cv2.resize(encuadrar(a, fmt, fx, fy)[:, :, 0], (W, H), interpolation=cv2.INTER_LINEAR) if ok2 else np.zeros((H, W), np.uint8)
            q.put((f, a, fi, si))
    q.put(None)


# ---------------------------------------------------------------- cierre

CIERRE_DEF = {"on": False, "texto": "Sígueme para más", "sub": "", "dur": 3.0, "barra": True, "fondo": "ultimo"}


def merge_cierre(c):
    return {**CIERRE_DEF, **(c or {})}


def tarjeta_cierre(enc, cierre, style, last, W, H, fps, colors, proj):
    """Escribe los fotogramas de la tarjeta final: fondo desenfocado y oscuro, llamado a la acción y una barra que se llena."""
    n = max(int(round(float(cierre["dur"]) * fps)), 1)
    if cierre["fondo"] == "marca":
        fondo = np.full((H, W, 3), (24, 24, 24), np.uint8)
    else:
        small = cv2.GaussianBlur(cv2.resize(last, (max(W // 6, 8), max(H // 6, 8)), interpolation=cv2.INTER_AREA), (0, 0), 3.0)
        fondo = cv2.convertScaleAbs(cv2.resize(small, (W, H), interpolation=cv2.INTER_LINEAR), alpha=0.38)
    textos = []
    if cierre["texto"].strip():
        textos.append(({"id": "c1", "text": cierre["texto"].strip(), "size": "L", "color": "accent", "anim": "pop", "start": 0.15, "end": 99.0}, 0.43))
    if cierre["sub"].strip():
        textos.append(({"id": "c2", "text": cierre["sub"].strip(), "size": "S", "color": "text", "anim": "fade", "start": 0.45, "end": 99.0}, 0.54))
    spr = [(title_sprite(e, style, W, H, colors), e, y) for e, y in textos]
    acc = colors["accent"][::-1]  # RGB -> BGR
    for i in range(n):
        t = i / fps
        fr = fondo.copy()
        if i < 6:
            fr = cv2.addWeighted(last, 1 - (i + 1) / 6, fr, (i + 1) / 6, 0)
        for sp, e, y in spr:
            rgb, a = sp
            sc, alpha, dx, dy, reveal, _sq = anim_state(e, t)
            if alpha > 0.01:
                if abs(sc - 1) > 0.004:
                    rgb, a = cv2.resize(rgb, None, fx=sc, fy=sc), cv2.resize(a, None, fx=sc, fy=sc)
                blit(fr, rgb, a, W * (0.5 + dx), H * (y + dy), alpha)
        if cierre["barra"]:
            bw, bh, by = int(W * 0.5), max(int(H * 0.006), 3), int(H * 0.64)
            x0 = (W - bw) // 2
            cv2.rectangle(fr, (x0, by), (x0 + bw, by + bh), (70, 70, 70), -1)
            cv2.rectangle(fr, (x0, by), (x0 + int(bw * (i + 1) / n), by + bh), acc, -1)
        enc.stdin.write(memoryview(fr))
    return n


# ---------------------------------------------------------------- render

def _trozo(segs, k0, k1):
    """Parte de los fotogramas conservados (numerados de corrido) entre k0 y k1, como (frame_ini, frame_fin, indice_del_tramo)."""
    out, n = [], 0
    for si, (a, b) in enumerate(segs):
        lo, hi = max(k0 - n, 0), min(k1 - n, b - a)
        if lo < hi:
            out.append((a + lo, a + hi, si))
        n += b - a
    return out


def _fotograma(segs, k):
    """(indice_del_tramo, frame_original) del fotograma conservado número k."""
    for si, (a, b) in enumerate(segs):
        if k < b - a:
            return si, a + k
        k -= b - a


def _acc_previo(segs, facs, k0):
    """Resto fraccionario de la cámara lenta tras los k0 fotogramas anteriores (para que un tramo arranque igual que el render seguido)."""
    acc, n = 0.0, 0
    for si, (a, b) in enumerate(segs):
        for _ in range(min(b - a, k0 - n)):
            acc += facs[si]
            acc -= max(int(acc + 1e-6), 1)
        n += b - a
    return acc


def paralelo(proj, calidad, desde, hasta, total, n, tmp):
    """Reparte los fotogramas en n tramos, cada uno en su propio proceso, y los une sin recodificar."""
    lim = [round(total * j / n) for j in range(n + 1)]
    correr_tramos(proj, "render", [f"{lim[j]}:{lim[j + 1]}" for j in range(n)], ["--calidad", calidad, "--desde", str(desde), "--hasta", str(hasta)],
                  total, lambda h: status(proj, "render", 92 * h / total, f"Fotograma {h} de {total}"), tmp)


def run(proj, calidad="final", desde=0.0, hasta=None, tramo=None, salida=None, hilos=None):
    """tramo=(k0, k1) y salida: modo trabajador, dibuja solo esos fotogramas sin audio. hilos=1 fuerza el render en un solo proceso."""
    proj = Path(proj)
    plan = load(proj, "plan.json")
    style = merge_style(plan.get("style"))
    cortes = plan.get("cortes") or {}
    W0, H0, fps, dur = probe(proj / "source.mp4")
    hasta = min(hasta or dur, dur)
    # Tramos que se conservan: se quita el silencio y lo borrado a mano en la transcripción.
    rangos = cutmod.rangos_plan(proj, plan, fps, dur)
    keep0 = cutmod.conservar(rangos, desde, hasta)
    keep = cutmod.con_lentos(keep0, plan.get("lentos") or [])  # (ini, fin, factor, tramo)
    mapa = cutmod.Mapa(keep)
    orig = [k[3] for k in keep]
    facs = [k[2] for k in keep]
    segs = [(int(round(s * fps)), int(round(e * fps))) for s, e, _, _ in keep]
    events = []
    if style["titulos"]:
        for e in sorted(plan["events"], key=lambda e: e["start"]):
            aj = mapa.ajustar(e["start"], e["end"])
            if aj:
                events.append({**e, "start": aj[0], "end": aj[1]})
    inten = float(style["zoomIntensidad"])
    zooms = []
    if style["zooms"]:
        zooms = [{"t": z["t"], "level": 1 + (z["level"] - 1) * inten} for z in sorted(plan.get("zooms", []), key=lambda z: z["t"])]
    fmt, (fx, fy) = formato_de(plan, W0, H0), encuadre_de(plan)
    if calidad in ("borrador", "medio"):
        src = ensure_proxy(proj, calidad == "medio")
        Ws, Hs, _, _ = probe(src)
    else:
        src = proj / "source.mp4"
        Ws, Hs = W0, H0
    _, _, cw, ch = cuadro_cover(Ws, Hs, fmt, fx, fy)
    W, H = par(cw), par(ch)
    total = max(sum(b - a for a, b in segs), 1)
    tmp = Path(salida) if tramo else proj / "_video.mp4"
    cierre = merge_cierre(plan.get("cierre"))

    def cerrar(extra):
        final = proj / ("final.mp4" if calidad == "final" and desde == 0 and hasta >= dur - 0.1 else "preview.mp4")
        sonidos = []
        if style["sonidos"]:
            sonidos += [(mapa.fuera(e["start"]), e.get("sfx", "none")) for e in events]
            if style["sfxZoom"] != "none":
                sonidos += [(mapa.fuera(z["t"]), style["sfxZoom"]) for z in zooms if z["level"] > 1.01 and mapa.vivo(z["t"])]
        if extra and style["sonidos"]:
            sonidos.append((mapa.total, style.get("sfxCierre", "ding")))
        mux(proj, tmp, final, sonidos, keep, plan, fps, extra)
        tmp.unlink(missing_ok=True)
        status(proj, "listo", 100, final.name)
        return final

    n_h = hilos if hilos is not None else hilos_auto()
    if not tramo and n_h > 1 and total >= 300:  # shortcut: por debajo de ~10 s no vale arrancar procesos; hilos=1 vuelve al modo de un solo proceso
        paralelo(proj, calidad, desde, hasta, total, n_h, tmp)
        return cerrar(max(int(round(cierre["dur"] * fps)), 1) / fps if cierre["on"] and hasta >= dur - 0.1 else 0.0)
    k0, k1 = tramo if tramo else (0, total)
    cap, acap = cv2.VideoCapture(str(src)), cv2.VideoCapture(str(proj / "alpha.mp4"))
    colors = {"accent": hex_rgb(style["accent"]), "text": hex_rgb(style["text"])}
    sprites = {}
    graf.ESCENAS = proj.parent.parent / "escenas"
    for ev in events:
        if ev.get("kind") in graf.TIPOS:
            sprites[ev["id"]] = graf.preparar(ev, style, W, H, colors)
        elif ev.get("anim") == "ruleta" and "|" in ev["text"]:
            sprites[ev["id"]] = [title_sprite({**ev, "text": p.strip()}, style, W, H, colors) for p in ev["text"].split("|") if p.strip()]
        else:
            sprites[ev["id"]] = title_sprite(ev, style, W, H, colors)
    evitar_solapes(events, sprites, style, H)
    puntos = sorted(graf.mitad_punto(e) for e in events if e.get("kind") == "punto")
    subs = style["subs"]
    words = cutmod.palabras_vivas(load(proj, "words.json", {"words": []})["words"], plan)
    caso_sub = subs.get("caso") or ("mayus" if subs.get("mayus", True) else "tal")
    chunks = build_chunks(words, int(subs["maxPal"]), caso_sub) if subs["on"] else []
    sub_cache, ci = {}, 0
    apply_look, apply_vig = make_look(style, W, H)
    peli = Pelicula(style, W, H)
    modo_bl = style.get('fondoModo', 'titulos')
    bl_edge = None
    blur_w = clamp(float(style["desenfoque"]))
    zoom_alt = bool(cortes.get("on") and cortes.get("zoomAlterna"))
    enc = subprocess.Popen([ffmpeg_exe(), "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", f"{fps}", "-i", "-",
                            *encoder_args(calidad), "-pix_fmt", "yuv420p", str(tmp)], stdin=subprocess.PIPE)
    q = queue.Queue(maxsize=12)
    threading.Thread(target=reader, args=(cap, acap, _trozo(segs, k0, k1), W, H, q, fmt, fx, fy), daemon=True).start()
    cx_z, cy_z = W / 2, H * (0.38 if H > W else 0.45)

    def escala(t, si):
        s = zoom_scale(zooms, t, style["zoomEstilo"], style["zoomDeriva"])
        if zoom_alt and orig[si] % 2 == 1:
            s *= 1.1  # corte con zoom: disimula el salto entre un tramo y el siguiente
        if sum(1 for m_ in puntos if m_ <= t) % 2 == 1:
            s *= 1.12  # después de cada punto la escena cambia de plano
        return s

    # Un tramo arranca con el mismo estado que tendría el render seguido: contador de grano, resto de cámara lenta y zoom del fotograma anterior.
    i = peli.n = k0
    acc_f, prev_out = _acc_previo(segs, facs, k0), None
    s_prev, mb = 1.0, float(style.get("motionBlur", 0))
    if k0:
        so, fo = _fotograma(segs, k0 - 1)
        s_prev = escala(fo / fps, so)
    while True:
        item = q.get()
        if item is None:
            break
        f, a, fi, si = item
        t = fi / fps
        f = apply_look(f)
        f = filtros.aplicar(f, plan, t, W)
        s = escala(t, si)
        if s > 1.001:
            M = np.float32([[s, 0, cx_z * (1 - s)], [0, s, cy_z * (1 - s)]])
            f = cv2.warpAffine(f, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
            a = cv2.warpAffine(a, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        f = peli.fondo(f, a)
        if mb > 0.02:  # estela horizontal del fondo: siempre (con un vaivén suave) o solo mientras el zoom se mueve
            vel = abs(s - s_prev) * fps
            siempre = style.get("motionBlurModo", "zoom") == "siempre"
            base = (0.55 + 0.25 * math.sin(t * 1.9)) if siempre else 0.0
            fuerza = max(min(vel * 3, 1.0) if vel > 0.05 else 0.0, base)
            if fuerza > 0.02:
                k = int(3 + (min(vel, 1.2) * 14 + (18 * base if siempre else 0)) * mb * 1.3) | 1
                est = cv2.blur(f, (k, 1))
                if "edge_mask" not in locals():
                    xx = np.abs(np.linspace(-1, 1, W, dtype=np.float32))[None, :]
                    edge_mask = np.repeat(np.clip((xx - 0.12) / 0.6, 0, 1)[..., None], 3, axis=2).repeat(H, axis=0)
                m_ = (np.ones_like(edge_mask) * 0.85 + edge_mask * 0.15) if siempre else edge_mask
                w_ = np.clip(m_ * fuerza * min(mb * 1.6, 1.0), 0, 1)
                if style.get("motionBlurSobre", "fondo") == "fondo":  # la estela solo en el fondo: tú sales nítido
                    w_ = w_ * (1 - a[..., None].astype(np.float32) / 255.0)
                f = (f * (1 - w_) + est * w_).astype(np.uint8)
        s_prev = s
        if style["zoomBN"] and s > 1.03:
            wbn = clamp((s - 1.03) / 0.05)
            f = cv2.addWeighted(f, 1 - wbn, cv2.cvtColor(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR), wbn, 0)
        active = [e for e in events if e["start"] - 0.02 <= t < e["end"]]
        back = [e for e in active if e.get("pos") in DETRAS]
        front = [e for e in active if e.get("pos") not in DETRAS]
        k = 0.0
        for e in events:
            if e.get("pos") in DETRAS:
                k = max(k, clamp((t - e["start"]) / 0.18) * clamp((e["end"] + 0.1 - t) / 0.2))
        layer = f
        if modo_bl == "siempre" and blur_w > 0:
            w_, osc = blur_w, 0.9
        elif modo_bl == "bordes" and blur_w > 0:
            w_, osc = blur_w, 0.9
        elif modo_bl != "off" and blur_w > 0 and k > 0.01:
            w_, osc = k * blur_w, 0.5
        else:
            w_, osc = 0.0, 0.5
        if w_ > 0.01:
            small = cv2.GaussianBlur(cv2.resize(f, (max(W // 6, 8), max(H // 6, 8)), interpolation=cv2.INTER_AREA), (0, 0), 4.2)
            bl = cv2.convertScaleAbs(cv2.resize(small, (W, H), interpolation=cv2.INTER_LINEAR), alpha=osc)
            if modo_bl == "bordes":
                if bl_edge is None:
                    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
                    rr = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H * 0.45) / (H * 0.55)) ** 2)
                    bl_edge = np.clip((rr - 0.55) / 0.6, 0, 1)[..., None].astype(np.float32)
                layer = (f * (1 - bl_edge * w_) + bl * (bl_edge * w_)).astype(np.uint8)
            else:
                layer = cv2.addWeighted(f, 1 - w_, bl, w_, 0)
        if back:
            layer = layer.copy()
            for e in back:
                con_opacidad(layer, e, lambda e=e: draw_event(layer, sprites[e["id"]], e, t, W, H))
        a3 = cv2.merge([a, a, a])
        out = cv2.add(cv2.multiply(f, a3, scale=1 / 255.0), cv2.multiply(layer, cv2.bitwise_not(a3), scale=1 / 255.0))
        out = peli.global_(out, a)
        out = apply_vig(out)
        for e in front:
            if e.get("kind") == "punto":
                continue
            if e.get("kind") in graf.TIPOS:
                con_opacidad(out, e, lambda e=e: graf.dibujar(out, e, sprites[e["id"]], t, W, H, colors))
            else:
                con_opacidad(out, e, lambda e=e: draw_event(out, sprites[e["id"]], e, t, W, H))
        if chunks:
            while ci < len(chunks) - 1 and chunks[ci]["end"] <= t:
                ci += 1
            ch = chunks[ci]
            if ch["start"] - 0.02 <= t < ch["end"]:
                ai = 0
                for j, wd in enumerate(ch["words"]):
                    if wd["start"] <= t + 0.03:
                        ai = j
                ocultas, tenues, pulsan, bump = (), (), (), 0.0
                modo_g = subs.get("conGrande", "completo")  # completo: el subtítulo nunca pierde una palabra
                if modo_g in ("quitar", "atenuar") or subs.get("pulso", True):
                    grandes = palabras_en_grande(events, t)
                    if grandes:
                        marcadas = tuple(j for j, wd in enumerate(ch["words"]) if any(_nz(wd["t"]) in ws and d0 <= wd["start"] <= d1 for ws, d0, d1 in grandes))
                        if modo_g in ("quitar", "atenuar"):
                            ocultas, tenues = (marcadas, ()) if modo_g == "quitar" else ((), marcadas)
                        if subs.get("pulso", True):  # la palabra late en el momento en que su título entra
                            for ws, d0, d1 in grandes:
                                dd = t - (d0 + 0.4)
                                js = tuple(j for j in marcadas if _nz(ch["words"][j]["t"]) in ws)
                                if 0 <= dd < 0.35 and js:
                                    pulsan += js
                                    bump = max(bump, math.sin(math.pi * dd / 0.35))
                if len(ocultas) < len(ch["words"]):
                    key = (ci, ai, ocultas, tenues, pulsan)
                    if key not in sub_cache:
                        if len(sub_cache) > 12:
                            sub_cache.clear()
                        sub_cache[key] = sub_sprite(ch, ai, style, W, H, colors, ocultas, tenues, pulsan)
                    rgb, sa = sub_cache[key]
                    d = t - max(ch["start"], keep[si][0])
                    sc = (0.92 + 0.08 * ease_out(clamp(d / 0.09))) * (1 + 0.07 * bump)
                    if abs(sc - 1) > 0.004:
                        rgb, sa = cv2.resize(rgb, None, fx=sc, fy=sc), cv2.resize(sa, None, fx=sc, fy=sc)
                    blit(out, rgb, sa, W / 2, H * float(subs["y"]), clamp(d / 0.05) * clamp((ch["end"] - t) / 0.06))
        for e in front:
            if e.get("kind") == "punto":
                graf.dibujar(out, e, None, t, W, H, colors)
        acc_f += facs[si]
        n_w = max(int(acc_f + 1e-6), 1)
        acc_f -= n_w
        if n_w > 1 and prev_out is not None:  # cámara lenta: se mezclan fotogramas para que el movimiento no salte
            for j in range(n_w):
                enc.stdin.write(memoryview(cv2.addWeighted(prev_out, 1 - (j + 1) / n_w, out, (j + 1) / n_w, 0)))
        else:
            for j in range(n_w):
                enc.stdin.write(memoryview(out))
        prev_out = out
        if i % 15 == 0:
            if tramo:
                Path(str(tmp) + ".prog").write_text(str(i - k0))
            else:
                status(proj, "render", 92 * i / total, f"Fotograma {i} de {total}")
        i += 1
    cap.release(); acap.release()
    extra = 0.0
    if cierre["on"] and hasta >= dur - 0.1 and i > k0 and (not tramo or k1 >= total):  # la tarjeta final la dibuja solo el último tramo
        n_c = tarjeta_cierre(enc, cierre, style, out, W, H, fps, colors, proj)
        extra = n_c / fps
    enc.stdin.close(); enc.wait()
    if tramo:
        return None
    return cerrar(extra)


KIND_Y = {"lista": 0.40, "conexion": 0.30, "numero": 0.42, "barras": 0.36}


def _alto_y(e, spr, H):
    """Altura aproximada (fracción de la pantalla) y desplazamiento del centro respecto a su y, para evitar solapes."""
    k = e.get("kind")
    n = max(len(e.get("items") or []), 1)
    if k is None:
        def visible(x):  # altura del trazo visible, sin el margen del brillo
            filas = np.where(x[1].max(axis=1) > 90)[0]
            return (filas[-1] - filas[0] + 1) if len(filas) else x[1].shape[0]
        hs = max(visible(x) for x in spr) if isinstance(spr, list) else visible(spr)
        return hs / H * 1.05, 0.0
    f = {"S": 0.045, "M": 0.06, "L": 0.075, "XL": 0.09}.get(e.get("size"), 0.06)
    if k == "lista":
        return min(n, 6) * f * 1.12 * 1.2, 0.0
    if k == "conexion":
        return 0.13 * (min(n, 4) - 1) + 0.09, 0.065 * (min(n, 4) - 1)
    if k == "numero":
        return 0.22, 0.06
    return 0.1 * min(n, 4), 0.05 * (min(n, 4) - 1)


def evitar_solapes(events, sprites, style, H):
    """Los títulos con altura automática se apartan de los subtítulos y de otros títulos que estén a la vez en pantalla.
    Un título al que el usuario le fijó la altura (campo y) se respeta tal cual."""
    s = style["subs"]
    sub = None
    if s.get("on"):
        half = SUB_SIZE.get(s["size"], 0.038) * 1.12 * (2 if int(s.get("maxPal", 3)) >= 3 else 1) / 2 + 0.015
        sub = (float(s["y"]), half * 2)
    items = []
    for e in events:
        if e.get("kind") in ("punto", "escena", "frase", "sticker") or (not e.get("kind") and e.get("pos") in DETRAS):
            continue
        alto, off = _alto_y(e, sprites[e["id"]], H)
        manual = e.get("y") is not None
        base = float(e["y"]) if manual else (KIND_Y.get(e.get("kind"), POS_Y.get(e.get("pos"), 0.30)) if e.get("kind") else POS_Y.get(e.get("pos"), 0.30))
        items.append({"e": e, "h": alto, "off": off, "c": base + off, "manual": manual})
    placed = []
    for it in sorted(items, key=lambda i: (not i["manual"], i["e"]["start"])):
        e = it["e"]
        obst = ([sub] if sub else []) + [(p["c"], p["h"]) for p in placed if p["e"]["start"] < e["end"] and e["start"] < p["e"]["end"]]
        if not it["manual"] and obst:
            c, h = it["c"], it["h"]
            choca = lambda x: any(abs(x - bc) < h / 2 + bh / 2 + 0.008 for bc, bh in obst)
            if choca(c):
                cand = []
                for bc, bh in obst:
                    cand += [bc - bh / 2 - h / 2 - 0.012, bc + bh / 2 + h / 2 + 0.012]
                cand = [x for x in cand if 0.03 + h / 2 <= x <= 0.97 - h / 2 and not choca(x)]
                if cand:
                    it["c"] = min(cand, key=lambda x: abs(x - c))
                    e["y"] = round(it["c"] - it["off"], 4)
        placed.append(it)



def con_opacidad(dst, e, fn):
    # opacidad del evento (0-1): se dibuja normal y se mezcla con lo que había debajo
    o = min(max(float(e.get("opacidad", 1)), 0.0), 1.0)
    if o >= 0.999:
        return fn()
    base = dst.copy()
    fn()
    dst[:] = (base.astype(np.float32) * (1 - o) + dst.astype(np.float32) * o).astype(np.uint8)


def draw_event(dst, spr, e, t, W, H):
    rgb, a = (None, None) if isinstance(spr, list) else spr
    sc, alpha, dx, dy, reveal, squash = anim_state(e, t)
    if alpha <= 0.01:
        return
    if isinstance(spr, list):  # ruleta: pasa por varias palabras y se detiene en la última
        d = t - e["start"]
        # Ruleta: tiempos en segundos; rebote y desenfoque son fracciones de una línea.
        POR_PALABRA, BASE, REBOTE, ASENTAR, DESENFOQUE = 0.14, 0.25, 0.04, 0.18, 0.10
        gira = POR_PALABRA * len(spr) + BASE
        u, pasos = clamp(d / gira), max(len(spr) - 1, 0)
        progreso = pasos * ease_out(u)
        # La velocidad normalizada permite que el desenfoque no dependa del número de palabras.
        velocidad = (1 - u) ** 2 if pasos else 0.0
        asiento = clamp((d - gira) / ASENTAR) if d > gira else 0.0
        rebote = -REBOTE * math.sin(math.pi * asiento) if d >= gira and asiento < 1 else 0.0
        sx, sy = sc * squash, sc / squash ** 0.7
        slot = max(x[1].shape[0] for x in spr) * sy
        y = e["y"] if e.get("y") is not None else POS_Y.get(e.get("pos"), 0.30)
        cy, top, bottom = H * (y + dy), H * (y + dy) - slot / 2, H * (y + dy) + slot / 2
        blur = DESENFOQUE * velocidad * slot
        for i, (word_rgb, word_a) in enumerate(spr):
            word_rgb, word_a = word_rgb.copy(), word_a.copy()
            if abs(sx - 1) > 0.004 or abs(sy - 1) > 0.004:
                word_rgb = cv2.resize(word_rgb, None, fx=sx, fy=sy, interpolation=cv2.INTER_LINEAR)
                word_a = cv2.resize(word_a, None, fx=sx, fy=sy, interpolation=cv2.INTER_LINEAR)
            if blur >= 1:
                k = max(3, int(round(blur)) * 2 + 1)
                soft_a = cv2.blur(word_a, (1, k))
                premul = word_rgb.astype(np.float32) * (word_a.astype(np.float32) / 255.0)[..., None]
                soft_rgb = cv2.blur(premul, (1, k))
                word_rgb = (soft_rgb / np.maximum(soft_a[..., None] / 255.0, 1e-3)).clip(0, 255).astype(np.uint8)
                word_a = soft_a
            word_cy = cy + (i - progreso + rebote) * slot
            y0, y1 = int(word_cy - word_a.shape[0] / 2), int(word_cy + word_a.shape[0] / 2)
            if y0 < top or y1 > bottom:
                first = int(clamp(top - y0, 0, word_a.shape[0]))
                last = int(clamp(bottom - y0, 0, word_a.shape[0]))
                word_a[:first, :] = 0
                word_a[last:, :] = 0
            blit(dst, word_rgb, word_a, W * (0.5 + dx), word_cy, alpha)
        return
    if abs(sc - 1) > 0.004 or abs(squash - 1) > 0.004:
        rgb = cv2.resize(rgb, None, fx=sc * squash, fy=sc / squash ** 0.7, interpolation=cv2.INTER_LINEAR)
        a = cv2.resize(a, None, fx=sc * squash, fy=sc / squash ** 0.7, interpolation=cv2.INTER_LINEAR)
    if reveal < 1:
        a = a.copy()
        a[:, int(a.shape[1] * reveal):] = 0
    y = e["y"] if e.get("y") is not None else POS_Y.get(e.get("pos"), 0.30)
    blit(dst, rgb, a, W * (0.5 + dx), H * (y + dy), alpha)


def audio_original(proj):
    raw = subprocess.run([ffmpeg_exe(), "-v", "error", "-i", str(proj / "source.mp4"), "-vn", "-ac", "2", "-ar", str(sfx.SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()


def mux(proj, video, out, sonidos, keep, plan, fps, extra=0.0):
    """Arma el audio: voz de los tramos que se quedan (con fundidos en cada unión), mejoras, música y efectos."""
    full = audio_original(proj)
    sr = sfx.SR
    sfx.carpeta = proj.parent.parent / 'sfx'
    sfx._cache = {k: v for k, v in sfx._cache.items() if not str(k).startswith('u:')}
    cortes = plan.get("cortes") or {}
    fade = int(sr * float(cortes.get("fundido", 12)) / 1000) if (cortes.get("on") or cortes.get("borradas")) else 0
    piezas = []
    lentos = plan.get("lentos") or []
    tr = [k[3] if len(k) > 3 else i for i, k in enumerate(keep)]
    for ik, k in enumerate(keep):
        s, e, f = k[0], k[1], (k[2] if len(k) > 2 else 1.0)
        a0, a1 = int(round(s * fps)) / fps, int(round(e * fps)) / fps  # mismo corte que el video
        seg = full[int(a0 * sr):int(a1 * sr)].copy()
        if f > 1.001:
            grave = any(l.get("grave") and l["start"] <= s + 0.01 and l["end"] >= e - 0.01 for l in lentos)
            seg = audiomod.estirar(seg, sr, f, grave)
        n = min(fade, len(seg) // 2)
        if n > 1 and len(keep) > 1:
            ramp = np.linspace(0, 1, n, dtype=np.float32)[:, None]
            if ik == 0 or tr[ik - 1] != tr[ik]:
                seg[:n] *= ramp
            if ik == len(keep) - 1 or tr[ik + 1] != tr[ik]:
                seg[-n:] *= ramp[::-1]
        piezas.append(seg)
    audio = np.concatenate(piezas) if piezas else full[:0]
    cfg = audiomod.merge_audio(plan.get("audio"))
    if cfg["mejorar"]:
        audio = audiomod.mejorar(audio, cfg)
    if extra > 0:
        audio = np.concatenate([audio, np.zeros((int(extra * sr), 2), np.float32)])  # la música sigue sonando durante el cierre
    audio = audiomod.mezclar_musica(audio, cfg, proj.parent.parent / "musica")
    for start, name in sonidos:
        snd, gain = sfx.get(name)
        gain = gain * float((plan.get('style') or {}).get('sfxVol', 1.0)) * float(((plan.get('style') or {}).get('sfxGanancia') or {}).get(name, 1.0))
        if snd is None:
            continue
        i0 = int(start * sr)
        if i0 < 0 or i0 >= len(audio):
            continue
        seg = snd[: len(audio) - i0] * gain
        audio[i0:i0 + len(seg)] += seg[:, None]
    audio = np.clip(audio, -1, 1)
    subprocess.run([ffmpeg_exe(), "-v", "error", "-y", "-i", str(video), "-f", "f32le", "-ar", str(sr), "-ac", "2", "-i", "-",
                    "-af", "alimiter=limit=0.97", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(out)],
                   input=audio.tobytes(), check=True)
