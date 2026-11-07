"""EXPERIMENTAL, no se usa todavía: recorte de persona (Robust Video Matting) en la GPU de la Mac, con MLX.
Resultado de las pruebas: la máscara sale igual que la de onnxruntime (diferencia < 1e-5), pero cuesta ~30 ms por cuadro sin
importar el tamaño del lote (cálculo, no latencia), contra ~19 ms por cuadro efectivos con 6 procesos de CPU. Por eso matte.py
sigue en CPU. Para convertir el modelo la primera vez hace falta `pip install onnx`.

Lee el mismo modelo ONNX (`models/rvm.onnx`), guarda una copia en un formato propio la primera vez (`models/rvm_mlx.npz` + `.json`)
y lo corre como un intérprete pequeño sobre MLX. Los tensores van en NHWC (el formato que prefiere la GPU); los ejes del modelo
(NCHW) se traducen al leer cada operación. Si algo falla, matte.py usa onnxruntime en la CPU.
"""
import json
import math
from pathlib import Path
import numpy as np

try:
    import mlx.core as mx
    _OK = bool(mx.metal.is_available())
except Exception:
    mx = None
    _OK = False

AXIS = {0: 0, 1: 3, 2: 1, 3: 2}  # eje de ONNX (NCHW) -> eje de MLX (NHWC)


def disponible():
    return _OK


def convertir(onnx_path, destino):
    """ONNX -> (json con el grafo, npz con los pesos). Solo hace falta el paquete `onnx` esta vez."""
    import onnx
    from onnx import helper, numpy_helper
    m = onnx.load(str(onnx_path))
    pesos = {i.name: numpy_helper.to_array(i) for i in m.graph.initializer}
    nodos = []
    for n in m.graph.node:
        if n.op_type == "Constant":
            for at in n.attribute:
                if at.name == "value":
                    pesos[n.output[0]] = numpy_helper.to_array(helper.get_attribute_value(at))
            continue
        a = {}
        for at in n.attribute:
            v = helper.get_attribute_value(at)
            if isinstance(v, bytes):
                v = v.decode()
            a[at.name] = list(v) if isinstance(v, (list, tuple)) or hasattr(v, "__iter__") and not isinstance(v, str) else v
        nodos.append({"op": n.op_type, "in": list(n.input), "out": list(n.output), "attrs": a})
    destino = Path(destino)
    np.savez(str(destino) + ".npz", **{k.replace("/", "__"): v for k, v in pesos.items()})
    Path(str(destino) + ".json").write_text(json.dumps({"nodos": nodos, "pesos": list(pesos.keys())}), "utf8")


class Rvm:
    def __init__(self, onnx_path):
        onnx_path = Path(onnx_path)
        base = onnx_path.with_name("rvm_mlx")
        if not (Path(str(base) + ".npz").exists() and Path(str(base) + ".json").exists()):
            convertir(onnx_path, base)
        g = json.loads(Path(str(base) + ".json").read_text("utf8"))
        self.nodos = [n for n in g["nodos"]]
        z = np.load(str(base) + ".npz")
        self.pesos = {k: z[k.replace("/", "__")] for k in g["pesos"]}
        self.conv = {}  # pesos de convolución ya convertidos a OHWI en la GPU
        for n in self.nodos:
            if n["op"] == "Conv":
                w = self.pesos[n["in"][1]]
                self.conv[n["in"][1]] = mx.array(np.ascontiguousarray(w.transpose(0, 2, 3, 1)))
                if len(n["in"]) > 2:
                    self.conv[n["in"][2]] = mx.array(self.pesos[n["in"][2]])
        self.cache4 = {}
        self.perfil = None

    # ---- utilidades ----
    def _const(self, nombre):
        return self.pesos[nombre]

    def _como_tensor(self, v):
        """Constantes de 4 dimensiones (NCHW) -> tensor NHWC; escalares y vectores de forma tal cual."""
        if isinstance(v, np.ndarray):
            if v.ndim == 4:
                return mx.array(np.ascontiguousarray(v.transpose(0, 2, 3, 1)).astype(np.float32))
            if v.ndim == 3 and v.dtype.kind == "f":  # (C, H, W) -> (H, W, C)
                return mx.array(np.ascontiguousarray(v.transpose(1, 2, 0)).astype(np.float32))
            return mx.array(v.astype(np.float32)) if v.dtype.kind == "f" else v
        return v

    @staticmethod
    def _onnx_shape(t):
        n, h, w, c = t.shape
        return np.array([n, c, h, w], np.int64)

    @staticmethod
    def _eje(a, nd=4):
        a = a + nd if a < 0 else a
        return AXIS[a] if nd == 4 else a

    def _resize_lineal(self, x, escalas):
        for ax_onnx in (2, 3):
            ax = AXIS[ax_onnx]
            n_in = x.shape[ax]
            s = float(escalas[ax_onnx])
            n_out = int(math.floor(n_in * s))
            if n_out == n_in and abs(s - 1.0) < 1e-9:
                continue
            d = np.arange(n_out, dtype=np.float64)
            src = (d + 0.5) / s - 0.5 if n_out > 1 else np.zeros(1)
            src = np.clip(src, 0, n_in - 1)
            i0 = np.floor(src).astype(np.int32)
            i1 = np.minimum(i0 + 1, n_in - 1)
            w = (src - i0).astype(np.float32)
            shp = [1, 1, 1, 1]
            shp[ax] = n_out
            wv = mx.array(w.reshape(shp))
            x = mx.take(x, mx.array(i0), axis=ax) * (1 - wv) + mx.take(x, mx.array(i1), axis=ax) * wv
        return x

    @staticmethod
    def _avgpool_ceil2(x):
        n, h, w, c = x.shape
        ph, pw = h % 2, w % 2
        cnt = mx.ones((1, h, w, 1), x.dtype)
        if ph or pw:
            x = mx.pad(x, [(0, 0), (0, ph), (0, pw), (0, 0)])
            cnt = mx.pad(cnt, [(0, 0), (0, ph), (0, pw), (0, 0)])
        H, W = x.shape[1], x.shape[2]
        s = x.reshape(n, H // 2, 2, W // 2, 2, c).sum(axis=(2, 4))
        k = cnt.reshape(1, H // 2, 2, W // 2, 2, 1).sum(axis=(2, 4))
        return s / k

    # ---- ejecución ----
    def __call__(self, src, r1, r2, r3, r4, ratio):
        """src: (1,h,w,3) float32 NHWC; r*: estados (NHWC); ratio: float. Devuelve (pha (1,h,w,1), [r1o..r4o])."""
        v = {"src": src, "r1i": r1, "r2i": r2, "r3i": r3, "r4i": r4, "downsample_ratio": np.array([ratio], np.float32)}
        P = self.pesos

        def get(nm):
            if nm in v:
                return v[nm]
            if nm in self.conv:
                return self.conv[nm]
            return P[nm]

        for n in self.nodos:
            op, ins, out, at = n["op"], n["in"], n["out"], n["attrs"]
            if self.perfil is not None:
                _t0 = __import__('time').perf_counter()
            if op == "Conv":
                x = get(ins[0])
                w = self.conv[ins[1]]
                p = at.get("pads", [0, 0, 0, 0])
                y = mx.conv2d(x, w, stride=tuple(at.get("strides", [1, 1])), padding=(p[0], p[1]), dilation=tuple(at.get("dilations", [1, 1])), groups=at.get("group", 1))
                if len(ins) > 2:
                    y = y + self.conv[ins[2]]
                v[out[0]] = y
            elif op in ("Add", "Sub", "Mul", "Div"):
                a, b = get(ins[0]), get(ins[1])
                if isinstance(a, np.ndarray) and isinstance(b, np.ndarray) and a.ndim < 4 and b.ndim < 4:
                    f = {"Add": np.add, "Sub": np.subtract, "Mul": np.multiply, "Div": (np.floor_divide if a.dtype.kind in "iu" and b.dtype.kind in "iu" else np.divide)}[op]
                    v[out[0]] = f(a, b)
                else:
                    a, b = self._como_tensor(a), self._como_tensor(b)
                    v[out[0]] = {"Add": mx.add, "Sub": mx.subtract, "Mul": mx.multiply, "Div": mx.divide}[op](a, b)
            elif op == "Relu":
                v[out[0]] = mx.maximum(get(ins[0]), 0)
            elif op == "HardSigmoid":
                v[out[0]] = mx.clip(get(ins[0]) * at.get("alpha", 0.2) + at.get("beta", 0.5), 0, 1)
            elif op == "Sigmoid":
                v[out[0]] = mx.sigmoid(get(ins[0]))
            elif op == "Tanh":
                v[out[0]] = mx.tanh(get(ins[0]))
            elif op == "Clip":
                lo = float(get(ins[1])) if len(ins) > 1 and ins[1] else None
                hi = float(get(ins[2])) if len(ins) > 2 and ins[2] else None
                v[out[0]] = mx.clip(get(ins[0]), lo, hi)
            elif op == "GlobalAveragePool":
                v[out[0]] = get(ins[0]).mean(axis=(1, 2), keepdims=True)
            elif op == "ReduceMean":
                axes = tuple(self._eje(a) for a in at.get("axes", [1]))
                v[out[0]] = get(ins[0]).mean(axis=axes, keepdims=bool(at.get("keepdims", 1)))
            elif op == "AveragePool":
                v[out[0]] = self._avgpool_ceil2(get(ins[0]))
            elif op == "Concat":
                xs = [get(i) for i in ins]
                if isinstance(xs[0], np.ndarray):
                    v[out[0]] = np.concatenate([np.atleast_1d(x) for x in xs], axis=0)
                else:
                    v[out[0]] = mx.concatenate([self._como_tensor(x) for x in xs], axis=self._eje(at["axis"]))
            elif op == "Split":
                x = get(ins[0])
                tam = at.get("split")
                cortes = np.cumsum(tam)[:-1].tolist()
                for o, parte in zip(out, mx.split(x, cortes, axis=self._eje(at["axis"]))):
                    v[o] = parte
            elif op == "Shape":
                x = get(ins[0])
                v[out[0]] = self._onnx_shape(x) if not isinstance(x, np.ndarray) else np.array(x.shape, np.int64)
            elif op == "Slice":
                x = get(ins[0])
                st, en = np.asarray(get(ins[1])).tolist(), np.asarray(get(ins[2])).tolist()
                axes = np.asarray(get(ins[3])).tolist() if len(ins) > 3 and ins[3] else list(range(len(st)))
                steps = np.asarray(get(ins[4])).tolist() if len(ins) > 4 and ins[4] else [1] * len(st)
                if isinstance(x, np.ndarray):
                    sl = [slice(None)] * x.ndim
                    for a, s0, e0, sp in zip(axes, st, en, steps):
                        sl[a] = slice(s0, e0 if abs(e0) < 2 ** 31 else None, sp)
                    v[out[0]] = x[tuple(sl)]
                else:
                    sl = [slice(None)] * 4
                    for a, s0, e0, sp in zip(axes, st, en, steps):
                        sl[self._eje(a)] = slice(s0, e0 if abs(e0) < 2 ** 31 else None, sp)
                    v[out[0]] = x[tuple(sl)]
            elif op == "Expand":
                x = get(ins[0])
                o = np.asarray(get(ins[1])).astype(int)  # (n, c, h, w) de ONNX
                v[out[0]] = mx.broadcast_to(x, (int(o[0]), int(o[2]), int(o[3]), int(o[1])))
            elif op == "Resize":
                x = get(ins[0])
                if len(ins) > 3 and ins[3]:  # tamaños de salida
                    sz = np.asarray(get(ins[3])).astype(int)
                    esc = [1.0, 1.0, sz[2] / x.shape[1], sz[3] / x.shape[2]]
                else:
                    esc = np.asarray(get(ins[2])).tolist()
                v[out[0]] = self._resize_lineal(x, esc)
            else:
                raise NotImplementedError(f"operación {op}")
            if self.perfil is not None:
                r_ = v[out[0]]
                if not isinstance(r_, np.ndarray):
                    mx.eval(r_)
                k_ = op if op != 'Conv' else f"Conv g{at.get('group',1)} k{at.get('kernel_shape')} s{at.get('strides')}"
                self.perfil[k_] = self.perfil.get(k_, 0.0) + __import__('time').perf_counter() - _t0
        return v["pha"], [v["r1o"], v["r2o"], v["r3o"], v["r4o"]]


def estados_iniciales():
    return [mx.zeros((1, 1, 1, 1), mx.float32) for _ in range(4)]
