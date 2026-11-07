"""Filtros de color sobre el video (mismas fórmulas que el filtro CSS del navegador, para que se vea igual en vivo y exportado)."""
import json
import math
from pathlib import Path
import cv2
import numpy as np

NEUTRO = {"grayscale": 0, "sepia": 0, "saturate": 1, "contrast": 1, "brightness": 1, "hue-rotate": 0, "blur": 0}
_LISTA = None


def lista():
    global _LISTA
    if _LISTA is None:
        _LISTA = {f["id"]: f for f in json.loads((Path(__file__).parent / "filtros.json").read_text("utf-8"))["filtros"]}
    return _LISTA


def k_en(f, t):
    """Intensidad en el instante t: k, con rampa de 0,25 s al entrar y salir si el filtro es de un tramo."""
    k = float(f.get("k", 1))
    a, b = f.get("start"), f.get("end")
    if a is None or b is None:
        return k
    if t < a or t >= b:
        return 0.0
    return k * max(0.0, min(1.0, (t - a) / 0.25, (b - t) / 0.25))


def ops_activas(plan, t):
    """[(nombre, valor)] de los filtros activos en t, ya escalados por la intensidad. Orden de la lista."""
    out = []
    for f in plan.get("filtros") or []:
        d = lista().get(f.get("filtro"))
        k = k_en(f, t)
        if not d or k <= 0.001:
            continue
        out += [(n, NEUTRO[n] + (v - NEUTRO[n]) * k) for n, v in d["ops"]]
    return out


def _matriz(n, v):
    if n == "grayscale":
        s = 1 - min(max(v, 0), 1)
        return [[.2126 + .7874 * s, .7152 - .7152 * s, .0722 - .0722 * s], [.2126 - .2126 * s, .7152 + .2848 * s, .0722 - .0722 * s], [.2126 - .2126 * s, .7152 - .7152 * s, .0722 + .9278 * s]]
    if n == "sepia":
        s = 1 - min(max(v, 0), 1)
        return [[.393 + .607 * s, .769 - .769 * s, .189 - .189 * s], [.349 - .349 * s, .686 + .314 * s, .168 - .168 * s], [.272 - .272 * s, .534 - .534 * s, .131 + .869 * s]]
    if n == "saturate":
        s = max(v, 0)
        return [[.213 + .787 * s, .715 - .715 * s, .072 - .072 * s], [.213 - .213 * s, .715 + .285 * s, .072 - .072 * s], [.213 - .213 * s, .715 - .715 * s, .072 + .928 * s]]
    th = math.radians(v)
    c, s = math.cos(th), math.sin(th)
    return [[.213 + .787 * c - .213 * s, .715 - .715 * c - .715 * s, .072 - .072 * c + .928 * s],
            [.213 - .213 * c + .143 * s, .715 + .285 * c + .140 * s, .072 - .072 * c - .283 * s],
            [.213 - .213 * c - .787 * s, .715 - .715 * c + .715 * s, .072 + .928 * c + .072 * s]]


def _op(x, n, v, W):
    """x: float32 RGB 0-1. Recorta a [0,1] después de cada operación, como el navegador."""
    if n == "brightness":
        x = x * v
    elif n == "contrast":
        x = (x - 0.5) * v + 0.5
    elif n == "blur":
        px = v * W / 1080
        return x if px < 0.05 else cv2.GaussianBlur(x, (0, 0), sigmaX=px)
    else:
        x = x @ np.array(_matriz(n, v), np.float32).T
    return np.clip(x, 0, 1)


def aplicar(frame_bgr, plan, t, W):
    ops = ops_activas(plan, t)
    if not ops:
        return frame_bgr  # lo normal: no hay filtros en este instante
    x = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    for n, v in ops:
        x = _op(x, n, v, W)
    return cv2.cvtColor((x * 255 + 0.5).astype(np.uint8), cv2.COLOR_RGB2BGR)


def _prueba():
    rojo = np.zeros((2, 2, 3), np.uint8); rojo[..., 2] = 255  # BGR
    g = aplicar(rojo, {"filtros": [{"id": "x", "filtro": "bn", "k": 1}]}, 0, 1080)
    assert abs(int(g[0, 0, 0]) - int(g[0, 0, 2])) <= 1  # R=G=B tras blanco y negro
    x = np.array([[[1.0, 0.0, 0.0]]], np.float32)
    assert abs(_op(x, "grayscale", 1, 1080)[0, 0, 0] - 0.2126) < 1e-4
    assert np.allclose(_op(x, "saturate", 1, 1080), x, atol=1e-4) and np.allclose(_op(x, "hue-rotate", 0, 1080), x, atol=1e-4)
    f = {"k": 1, "start": 1, "end": 3}
    assert k_en(f, 0.5) == 0 and k_en(f, 1.125) == 0.5 and k_en(f, 2) == 1 and k_en({"k": 0.5}, 9) == 0.5
    assert aplicar(rojo, {}, 0, 1080) is rojo
    print("filtros: ok")
