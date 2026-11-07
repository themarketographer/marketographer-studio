"""Elementos animados que no son un título simple: listas que enfocan un punto, conexiones entre ideas, números y barras, y el punto que cambia de escena.

Cada tipo tiene dos funciones: preparar (arma los sprites una sola vez) y dibujar (los pone en el fotograma según el tiempo)."""
import math
import re
import cv2
import numpy as np
import render as R

NUEVOS = ("rotulo", "llamada", "etiqueta", "seccion", "clip")  # gráficos esenciales y B-roll
BROLL = None  # carpeta con los videos e imágenes de B-roll (la fija render.py)
TIPOS = ("lista", "conexion", "numero", "barras", "punto", "escena", "frase", "sticker") + NUEVOS
ESCENAS = None  # carpeta con las imágenes de las escenas (la fija render.py)
_EMOJI_FUENTES = [("/System/Library/Fonts/Apple Color Emoji.ttc", 160), ("/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf", 109),
                  ("/usr/share/fonts/noto/NotoColorEmoji.ttf", 109), ("C:/Windows/Fonts/seguiemj.ttf", 109)]


def _sprite(texto, pxf, color, style, W, H, colors):
    ev = {"id": "g", "text": texto, "size": "M", "pxf": pxf, "color": color, "anim": "fade", "start": 0.0, "end": 99.0}
    return R.title_sprite(ev, style, W, H, colors)


def _blit_scaled(dst, spr, cx, cy, alpha, sc=1.0):
    rgb, a = spr
    if abs(sc - 1) > 0.004:
        rgb, a = cv2.resize(rgb, None, fx=sc, fy=sc, interpolation=cv2.INTER_LINEAR), cv2.resize(a, None, fx=sc, fy=sc, interpolation=cv2.INTER_LINEAR)
    R.blit(dst, rgb, a, cx, cy, alpha)


def _borroso(spr, k):
    rgb, a = spr
    k = int(k) | 1
    return cv2.GaussianBlur(rgb, (k, k), 0), cv2.GaussianBlur(a, (k, k), 0)


def _grupos_emoji(txt):
    """Separa un texto en emojis completos (incluye secuencias con ZWJ, selectores y tonos de piel)."""
    out = []
    for ch in txt:
        o = ord(ch)
        if ch.isspace():
            continue
        unir = o in (0x200D, 0xFE0F) or 0x1F3FB <= o <= 0x1F3FF or (out and out[-1].endswith("\u200d"))
        if unir and out:
            out[-1] += ch
        else:
            out.append(ch)
    return out[:6]


def _emoji_sprite(cluster, px):
    """Dibuja un emoji a color con la fuente del sistema. Devuelve (bgr, alfa) o None si no hay fuente."""
    from PIL import Image, ImageDraw, ImageFont
    import os
    for ruta, nat in _EMOJI_FUENTES:
        if not os.path.exists(ruta):
            continue
        try:
            fuente = ImageFont.truetype(ruta, nat)
            lienzo = Image.new("RGBA", (nat * 2, nat * 2), (0, 0, 0, 0))
            ImageDraw.Draw(lienzo).text((nat // 2, nat // 4), cluster, font=fuente, embedded_color=True)
            caja = lienzo.getbbox()
            if not caja:
                continue
            lienzo = lienzo.crop(caja)
            k = px / max(lienzo.size[1], 1)
            lienzo = lienzo.resize((max(int(lienzo.size[0] * k), 2), max(int(lienzo.size[1] * k), 2)), Image.LANCZOS)
            arr = np.array(lienzo)
            return cv2.cvtColor(arr[..., :3], cv2.COLOR_RGB2BGR), arr[..., 3].copy()
        except Exception:
            continue
    return None


def _fondo_escena(ev, W, H):
    modo = ev.get("fondo", "degradado")
    c1 = np.array(R.hex_rgb(ev.get("c1") or "#1b1b1b")[::-1], np.float32)
    c2 = np.array(R.hex_rgb(ev.get("c2") or "#000000")[::-1], np.float32)
    if modo == "color":
        return np.full((H, W, 3), c1, np.uint8)
    if modo == "degradado":
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        u = np.clip((yy / H * 0.85 + xx / W * 0.15), 0, 1)[..., None]
        return (c1 * (1 - u) + c2 * u).astype(np.uint8)
    if modo == "imagen" and ev.get("imagen") and ESCENAS:
        img = cv2.imread(str(ESCENAS / re.sub(r"[^\w.\- ]", "", str(ev["imagen"]))), cv2.IMREAD_COLOR)
        if img is not None:
            k = max(W / img.shape[1], H / img.shape[0])
            img = cv2.resize(img, None, fx=k, fy=k, interpolation=cv2.INTER_AREA if k < 1 else cv2.INTER_CUBIC)
            y0, x0 = (img.shape[0] - H) // 2, (img.shape[1] - W) // 2
            img = img[y0:y0 + H, x0:x0 + W].copy()
            if ev.get("velo", True):
                img = (img.astype(np.float32) * 0.62).astype(np.uint8)  # un velo oscuro para que el texto se lea
            return img
        return np.full((H, W, 3), c1, np.uint8)
    return None


def kf_valor(ev, prop, d, base):
    """Valor de una propiedad animada con fotogramas clave en el instante d (segundos desde que empieza el elemento).
    Misma fórmula que keyframes.js (kfValor): smoothstep entre fotogramas, quieto antes del primero y después del último."""
    ks = sorted((k for k in (ev.get("kf") or []) if k.get(prop) is not None), key=lambda k: k["t"])
    if not ks:
        return base
    if d <= ks[0]["t"]:
        return ks[0][prop]
    if d >= ks[-1]["t"]:
        return ks[-1][prop]
    for a, b in zip(ks, ks[1:]):
        if d <= b["t"]:
            f = (d - a["t"]) / max(b["t"] - a["t"], 1e-6)
            e = f * f * (3 - 2 * f)
            return a[prop] + (b[prop] - a[prop]) * e
    return ks[-1][prop]


def _anima_ancho_rot(ev):
    return any(k.get("ancho") is not None or k.get("rot") is not None for k in (ev.get("kf") or []))


def _preparar_sticker(ev, W, H):
    """Imagen con transparencia (png) a su tamaño final. Devuelve (rgb, alfa) o None si no se encuentra."""
    if not ESCENAS:
        return None
    img = cv2.imread(str(ESCENAS / re.sub(r"[^\w.\- ]", "", str(ev.get("archivo", "")))), cv2.IMREAD_UNCHANGED)
    if img is None:
        return None
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    if img.shape[2] == 3:
        img = np.dstack([img, np.full(img.shape[:2], 255, np.uint8)])
    anchos = [float(ev.get("ancho", 0.3))] + [float(k["ancho"]) for k in (ev.get("kf") or []) if k.get("ancho") is not None]
    k = max(max(anchos), 0.03) * W / img.shape[1]  # con animación se prepara al ancho mayor y se achica al dibujar
    img = cv2.resize(img, None, fx=k, fy=k, interpolation=cv2.INTER_AREA if k < 1 else cv2.INTER_CUBIC)
    rot = float(ev.get("rot", 0) or 0)
    if _anima_ancho_rot(ev):
        return img[..., :3].copy(), img[..., 3].copy(), max(max(anchos), 0.03)  # tercer dato: ancho (fracción de W) de este sprite; el giro se hace al dibujar
    if abs(rot) > 0.1:
        h0, w0 = img.shape[:2]
        c, sn = abs(math.cos(math.radians(rot))), abs(math.sin(math.radians(rot)))
        nw, nh = int(w0 * c + h0 * sn) + 2, int(h0 * c + w0 * sn) + 2
        M = cv2.getRotationMatrix2D((w0 / 2, h0 / 2), rot, 1.0)
        M[0, 2] += nw / 2 - w0 / 2
        M[1, 2] += nh / 2 - h0 / 2
        img = cv2.warpAffine(img, M, (nw, nh), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))
    return img[..., :3].copy(), img[..., 3].copy()


def _dibujar_sticker(dst, ev, obj, t, W, H):
    if obj is None:
        return
    d, tail = t - ev["start"], ev["end"] - t
    if d < 0 or tail <= 0:
        return
    op = kf_valor(ev, "op", d, float(ev.get("op", 1.0)))
    if ev.get("fija"):  # marca de agua: sin animación, siempre visible
        _blit_scaled(dst, obj[:2], W * float(ev.get("x", 0.85)), H * float(ev.get("y", 0.08)), op, 1.0)
        return
    sc, dy, al, rev, bl = _estado_entrada(ev.get("anim", "pop"), d)
    salida = ev.get("salida", "fade")
    v = 1 - R.clamp(tail / 0.25)
    if salida == "encoger":
        sc *= 1 - 0.3 * v
    dy_s = {"subir": -0.05 * v, "bajar": 0.05 * v}.get(salida, 0.0)
    al *= 1 - v if salida != "corte" else 1.0
    if al <= 0.01:
        return
    rgb, a = obj[0], obj[1]
    if len(obj) > 2:  # con fotogramas clave en tamaño o giro: se achica y se gira aquí
        ancho_t, rot_t = max(kf_valor(ev, "ancho", d, float(ev.get("ancho", 0.3))), 0.03), kf_valor(ev, "rot", d, float(ev.get("rot", 0) or 0))
        k = ancho_t / obj[2]
        h0, w0 = rgb.shape[:2]
        c_, s_ = abs(math.cos(math.radians(rot_t))), abs(math.sin(math.radians(rot_t)))
        nw, nh = max(int((w0 * c_ + h0 * s_) * k) + 2, 2), max(int((h0 * c_ + w0 * s_) * k) + 2, 2)
        M = cv2.getRotationMatrix2D((w0 / 2, h0 / 2), rot_t, k)
        M[0, 2] += nw / 2 - w0 / 2  # el centro del sprite va al centro del lienzo nuevo
        M[1, 2] += nh / 2 - h0 / 2
        img4 = cv2.warpAffine(np.dstack([rgb, a]), M, (nw, nh), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))
        rgb, a = img4[..., :3].copy(), img4[..., 3].copy()
    if bl > 0.5:
        kb = int(bl) | 1
        rgb, a = cv2.GaussianBlur(rgb, (kb, kb), 0), cv2.GaussianBlur(a, (kb, kb), 0)
    if rev < 1:
        a = a.copy()
        a[:, int(a.shape[1] * rev):] = 0
    _blit_scaled(dst, (rgb, a), W * kf_valor(ev, "x", d, float(ev.get("x", 0.5))), H * (kf_valor(ev, "y", d, float(ev.get("y", 0.3))) + dy + dy_s), op * min(al, 1.0), max(sc, 0.05))


def preparar(ev, style, W, H, colors):
    if ev["kind"] in NUEVOS:
        return _preparar_nuevo(ev, style, W, H, colors)
    if ev["kind"] == "sticker":
        return _preparar_sticker(ev, W, H)
    if ev["kind"] == "frase":
        return _preparar_frase(ev, style, W, H, colors)
    if ev["kind"] == "escena":
        txt = " ".join(str(x) for x in ev.get("items", []) if str(x).strip())
        em = float(ev.get("emojiTam", 1.0)) * 0.12 * H
        return {"bg": _fondo_escena(ev, W, H), "txt": R.title_sprite({**ev, "text": txt, "kind": None, "size": ev.get("size", "L")}, style, W, H, colors) if txt else None,
                "emo": [s for s in (_emoji_sprite(c, em) for c in _grupos_emoji(ev.get("emoji", ""))) if s]}
    k, items = ev["kind"], [str(x) for x in ev.get("items", []) if str(x).strip()]
    size = ev.get("size", "M")
    f = {"S": 0.045, "M": 0.06, "L": 0.075, "XL": 0.09}.get(size, 0.06)
    if k == "lista":
        nitems = items[:6]
        activos = [_sprite(t, f, "accent", style, W, H, colors) for t in nitems]
        opacos = [_borroso(_sprite(t, f, "text", style, W, H, colors), max(W // 90, 5)) for t in nitems]
        return {"n": len(nitems), "activos": activos, "opacos": opacos}
    if k == "conexion":
        nodos = [_sprite(t, f * 0.9, "text" if i % 2 else "accent", style, W, H, colors) for i, t in enumerate(items[:4])]
        return {"nodos": nodos}
    if k == "numero":
        valor = items[0] if items else "0"
        etiqueta = items[1] if len(items) > 1 else ""
        m = re.match(r"^(\D*?)(\d[\d.,]*)(.*)$", valor)
        pre, num, suf = (m.group(1), m.group(2), m.group(3)) if m else ("", "0", valor)
        fin = float(num.replace(",", "").replace(".", "")) if re.fullmatch(r"\d{1,3}([.,]\d{3})+", num) else float(num.replace(",", "."))
        dec = len(num.split(",")[-1]) if re.fullmatch(r"\d+,\d{1,2}", num) else 0
        return {"pre": pre, "suf": suf, "fin": fin, "dec": dec, "etq": _sprite(etiqueta, 0.04, "text", style, W, H, colors) if etiqueta else None, "cache": {}, "args": (style, W, H, colors), "size": size}
    if k == "barras":
        filas = []
        for t in items[:4]:
            nombre, _, v = t.partition(":")
            try:
                val = float(v.strip().rstrip("%").replace(",", "."))
            except ValueError:
                val = 50.0
            filas.append((val, _sprite(nombre.strip(), 0.035, "text", style, W, H, colors)))
        return {"filas": filas, "mx": max([v for v, _ in filas] + [1.0])}
    return {}


def dibujar(dst, ev, obj, t, W, H, colors):
    k = ev["kind"]
    d, tail = t - ev["start"], ev["end"] - t
    alpha = R.clamp(d / 0.2) * R.clamp(tail / 0.25)
    if alpha <= 0.01 and k != "punto":
        return
    if k in NUEVOS:
        return _dibujar_nuevo(dst, ev, obj, t, W, H, colors)
    if k == "sticker":
        return _dibujar_sticker(dst, ev, obj, t, W, H)
    if k == "escena":
        return _dibujar_escena(dst, ev, obj, t, W, H, colors)
    if k == "frase":
        return _dibujar_frase(dst, ev, obj, t, W, H, colors)
    y0 = float(ev["y"]) if ev.get("y") is not None else None
    if k == "lista":
        n = obj["n"]
        if not n:
            return
        y0 = 0.40 if y0 is None else y0
        paso = (ev["end"] - ev["start"] - 0.3) / n
        activo = min(int(max(d - 0.15, 0) / max(paso, 0.2)), n - 1)
        alto = max(s[1].shape[0] for s in obj["activos"])
        gap = alto * 1.12
        top = H * y0 - gap * (n - 1) / 2
        for i in range(n):
            u = R.clamp((d - 0.15 - i * paso) / 0.25) * (1 - R.clamp((d - 0.15 - (i + 1) * paso) / 0.25)) if i < n - 1 else R.clamp((d - 0.15 - i * paso) / 0.25)
            cy = top + gap * i
            _blit_scaled(dst, obj["opacos"][i], W / 2, cy, alpha * (0.75 - 0.25 * u) * (1 - u * 0.0), 1.0)
            if u > 0.01:
                _blit_scaled(dst, obj["activos"][i], W / 2, cy, alpha * u, 1.0 + 0.07 * R.ease_out(u))
    elif k == "conexion":
        nodos = obj["nodos"]
        n = len(nodos)
        if not n:
            return
        y0 = 0.30 if y0 is None else y0
        xs = [0.30, 0.70, 0.32, 0.68]
        paso = min(0.8, max((ev["end"] - ev["start"] - 0.4) / (n + 0.5), 0.3))
        pos = [(W * xs[i], H * (y0 + 0.13 * i)) for i in range(n)]
        acc = colors["accent"][::-1]
        for i in range(n):
            u = R.clamp((d - i * paso) / 0.25)
            if u <= 0:
                continue
            _blit_scaled(dst, nodos[i], pos[i][0], pos[i][1], alpha * u, 0.85 + 0.15 * R.ease_out(u))
            if i > 0:
                a_, b_ = pos[i - 1], pos[i]
                h0, h1 = nodos[i - 1][1].shape[0] / 2 + 12, nodos[i][1].shape[0] / 2 + 12
                p0, p2 = (a_[0], a_[1] + h0), (b_[0], b_[1] - h1)
                c = ((p0[0] + p2[0]) / 2 + (40 if i % 2 else -40), (p0[1] + p2[1]) / 2)
                prog = R.ease_in_out(R.clamp((d - (i * paso) + 0.35) / 0.35))
                pts = [(int((1 - s) ** 2 * p0[0] + 2 * (1 - s) * s * c[0] + s * s * p2[0]), int((1 - s) ** 2 * p0[1] + 2 * (1 - s) * s * c[1] + s * s * p2[1])) for s in np.linspace(0, prog, 24)]
                if len(pts) > 1:
                    cv2.polylines(dst, [np.array(pts, np.int32)], False, acc, max(H // 400, 3), cv2.LINE_AA)
                    cv2.circle(dst, pts[-1], max(H // 220, 6), acc, -1, cv2.LINE_AA)
    elif k == "numero":
        y0 = 0.42 if y0 is None else y0
        u = R.ease_out(R.clamp(d / 1.0))
        val = obj["fin"] * u
        txt = (f"{val:.{obj['dec']}f}" if obj["dec"] else f"{int(round(val)):,}".replace(",", ".") if obj["fin"] >= 10000 else f"{int(round(val))}")
        txt = obj["pre"] + txt + obj["suf"]
        if txt not in obj["cache"]:
            if len(obj["cache"]) > 40:
                obj["cache"].clear()
            obj["cache"][txt] = _sprite(txt, {"S": 0.1, "M": 0.13, "L": 0.16, "XL": 0.19}.get(obj["size"], 0.16), "accent", *obj["args"])
        _blit_scaled(dst, obj["cache"][txt], W / 2, H * y0, alpha, 1.0 + 0.04 * (1 - u))
        if obj["etq"]:
            _blit_scaled(dst, obj["etq"], W / 2, H * (y0 + 0.12), alpha * R.clamp((d - 0.3) / 0.3), 1.0)
    elif k == "barras":
        filas = obj["filas"]
        y0 = 0.36 if y0 is None else y0
        acc = colors["accent"][::-1]
        bw, bh = int(W * 0.72), max(H // 60, 14)
        x0 = (W - bw) // 2
        for i, (val, spr) in enumerate(filas):
            yy = int(H * y0 + i * H * 0.1)
            u = R.ease_out(R.clamp((d - 0.15 - i * 0.18) / 0.6))
            _blit_scaled(dst, spr, W / 2, yy, alpha * R.clamp((d - i * 0.18) / 0.2), 1.0)
            ov = dst.copy()
            cv2.rectangle(ov, (x0, yy + H // 30), (x0 + bw, yy + H // 30 + bh), (70, 70, 70), -1)
            cv2.rectangle(ov, (x0, yy + H // 30), (x0 + int(bw * val / obj["mx"] * u), yy + H // 30 + bh), acc, -1)
            cv2.addWeighted(ov, alpha, dst, 1 - alpha, 0, dst)
    elif k == "punto":
        dur = max(ev["end"] - ev["start"], 0.3)
        u = d / dur
        if u < 0 or u > 1:
            return
        cx, cy = W * float(ev.get("x", 0.5)), H * float(ev.get("y", 0.5) if ev.get("y") is not None else 0.5)
        rmax = math.hypot(max(cx, W - cx), max(cy, H - cy)) * 1.02
        r = rmax * (R.ease_in_out(u / 0.5) if u < 0.5 else 1 - R.ease_in_out((u - 0.5) / 0.5))
        r = max(r, 0) + (W * 0.012 if 0.02 < u < 0.98 else 0)
        if r > 1:
            cv2.circle(dst, (int(cx), int(cy)), int(r), colors["accent"][::-1], -1, cv2.LINE_AA)


def mitad_punto(ev):
    return ev["start"] + max(ev["end"] - ev["start"], 0.3) / 2


def _dibujar_escena(dst, ev, obj, t, W, H, colors=None):
    """Transición de entrada y salida de la escena: fade (por defecto), cruce (desvanecido largo), barrido (cortina lateral) o zoom (corte con golpe de zoom)."""
    tr = ev.get("trans", "fade")
    d, tail = t - ev["start"], ev["end"] - t
    if tr in ("fade", "cruce", None):
        ent, sal = (0.22, 0.25) if tr != "cruce" else (0.55, 0.55)
        _pintar_escena(dst, ev, obj, t, W, H, R.clamp(d / ent) * R.clamp(tail / sal))
        return
    if d < 0 or tail <= 0:
        return
    capa = dst.copy()
    _pintar_escena(capa, ev, obj, t, W, H, 1.0)
    if tr == "zoom":
        u = R.ease_out(R.clamp(d / 0.28))
        k = 1.0 + 0.22 * (1 - u)
        if k > 1.002:
            z = cv2.resize(capa, None, fx=k, fy=k, interpolation=cv2.INTER_LINEAR)
            y0, x0 = (z.shape[0] - H) // 2, (z.shape[1] - W) // 2
            capa = z[y0:y0 + H, x0:x0 + W]
        dst[:] = capa
        return
    # barrido: una cortina cruza de izquierda a derecha al entrar y vuelve a cruzar al salir
    ent, sal = R.ease_in_out(R.clamp(d / 0.38)), R.ease_in_out(R.clamp((0.38 - tail) / 0.38))
    x_ini, x_fin = int(W * ent), int(W * sal)
    if sal > 0:
        capa_vis = (x_fin, W)
    else:
        capa_vis = (0, x_ini)
    a, b = capa_vis
    if b > a:
        dst[:, a:b] = capa[:, a:b]
    acc = (colors or {"accent": (255, 210, 63)})["accent"][::-1]
    borde = x_fin if sal > 0 else x_ini
    if 0 < borde < W:
        cv2.rectangle(dst, (borde - 3, 0), (borde + 3, H), acc, -1)


def _pintar_escena(dst, ev, obj, t, W, H, alpha):
    d = t - ev["start"]
    if obj["bg"] is not None:
        bg = obj["bg"]
        if ev.get("fondo") == "imagen":  # un acercamiento lento le da vida a la foto
            k = 1.0 + 0.05 * R.clamp(d / max(ev["end"] - ev["start"], 0.5))
            if k > 1.002:
                z = cv2.resize(bg, None, fx=k, fy=k, interpolation=cv2.INTER_LINEAR)
                y0, x0 = (z.shape[0] - H) // 2, (z.shape[1] - W) // 2
                bg = z[y0:y0 + H, x0:x0 + W]
        cv2.addWeighted(bg, alpha, dst, 1 - alpha, 0, dst)
    y0 = float(ev["y"]) if ev.get("y") is not None else (0.3 if ev.get("fondo") == "ninguno" else 0.5)
    emo = obj["emo"]
    if emo:
        eh = max(s[1].shape[0] for s in emo)
        gapx = eh * 0.25
        ancho = sum(s[1].shape[1] for s in emo) + gapx * (len(emo) - 1)
        x = W / 2 - ancho / 2
        for i, (rgb, a) in enumerate(emo):
            u = R.clamp((d - 0.08 * i) / 0.34)
            sc = 0.2 + 0.8 * R.ease_back(u)
            flota = math.sin(t * 3.0 + i * 1.3) * H * 0.006 * R.clamp(d / 0.5)
            w = rgb.shape[1]
            _blit_scaled(dst, (rgb, a), x + w / 2, H * (y0 - 0.12 if obj["txt"] else y0) + flota, alpha * R.clamp(u * 3), max(sc, 0.05))
            x += w + gapx
    if obj["txt"]:
        ev2 = {**ev, "kind": None, "y": y0 + 0.04 if emo else y0, "start": ev["start"] + (0.18 if emo else 0.0), "pos": "centro"}
        R.draw_event(dst, obj["txt"], ev2, t, W, H)


# ---------- frases: texto que se va armando al ritmo de la voz ----------
FRASE_PX = {"S": 0.05, "M": 0.065, "L": 0.08, "XL": 0.1}
PATRON_PILA = (1.0, 1.3, 0.95, 1.2)
ENTRADAS = ("pop", "deslizar", "caer", "escribir", "desenfoque", "zoom", "rebote", "resorte")
SALIDAS = ("fade", "subir", "bajar", "encoger", "corte")


def es_emoji(ch):
    o = ord(ch)
    return o >= 0x1F000 or 0x2600 <= o <= 0x27BF or o in (0x2B50, 0x2B55, 0x2B06, 0x2B07, 0x2764, 0x203C, 0x2049, 0x00A9, 0x00AE)


def piezas(token):
    """Separa una palabra en trozos de texto y emojis: 'dinero💰' -> [('t','dinero'), ('e','💰')]."""
    out, buf, i = [], "", 0
    chars = list(token)
    while i < len(chars):
        ch = chars[i]
        if es_emoji(ch):
            if buf:
                out.append(("t", buf))
                buf = ""
            cl = ch
            i += 1
            while i < len(chars) and (chars[i] in "\u200d\ufe0f" or 0x1F3FB <= ord(chars[i]) <= 0x1F3FF or (cl.endswith("\u200d") and es_emoji(chars[i]))):
                cl += chars[i]
                i += 1
            out.append(("e", cl))
        elif ch in "\ufe0f\u200d":
            i += 1
        else:
            buf += ch
            i += 1
    if buf:
        out.append(("t", buf))
    return out


def tiempos_palabras(ev, n):
    ts = [float(x) for x in (ev.get("times") or [])] or [ev["start"]]
    if n <= 1:
        return [ts[0]] * max(n, 1)
    return [ts[min(i, len(ts) - 1)] if len(ts) == n else ts[int(round(i * (len(ts) - 1) / (n - 1)))] for i in range(n)]


def agrupar_lineas(tokens, modo):
    """Reparte las palabras en renglones. Las palabras muy cortas se pegan a la siguiente."""
    lineas, act = [], []
    for k, tk in enumerate(tokens):
        largo = sum(len(x[1]) for x in tk["p"] if x[0] == "t") or 2
        n_act = sum(sum(len(x[1]) for x in a["p"] if x[0] == "t") or 2 for a in act)
        corta_previa = bool(act) and (sum(len(x[1]) for x in act[-1]["p"] if x[0] == "t") or 2) <= 2
        tope = 2 if modo == "pila" else 99
        lim = 16 if modo == "pila" else 20
        if act and not corta_previa and (len(act) >= tope or n_act + largo > lim):
            lineas.append(act)
            act = []
        act.append(tk)
    if act:
        lineas.append(act)
    return lineas


def _recorte(spr):
    rgb, a = spr
    ys, xs = np.where(a > 24)
    if not len(xs):
        return rgb, a, rgb.shape[1] * 0.5, rgb.shape[0] * 0.5, 0.0
    cx_ink = (xs.min() + xs.max() + 1) / 2 - rgb.shape[1] / 2
    return rgb, a, float(xs.max() - xs.min() + 1), float(ys.max() - ys.min() + 1), float(cx_ink)


def _preparar_frase(ev, style, W, H, colors):
    texto = str(ev.get("text", ""))
    crudo = [t for t in texto.split() if t]
    tiempos = tiempos_palabras(ev, len(crudo))
    marcador = bool(ev.get("marcador"))
    r_, g_, b_ = colors["accent"]
    colores_inv = (17, 17, 17) if (0.299 * r_ + 0.587 * g_ + 0.114 * b_) > 140 else (255, 255, 255)  # el texto sobre el marcador siempre contrasta
    toks = []
    for i, c in enumerate(crudo):
        emph = c.startswith("*") and c.count("*") >= 2 and len(c.strip("*")) > 1
        toks.append({"p": piezas(c.replace("*", "")), "emph": emph, "s": tiempos[i]})
    lineas = agrupar_lineas(toks, ev.get("layout", "pila"))
    base = FRASE_PX.get(ev.get("size", "L"), 0.08) * H
    cuerpo = []
    for li, linea in enumerate(lineas):
        esc = PATRON_PILA[li % len(PATRON_PILA)] if ev.get("layout", "pila") == "pila" else 1.0
        items, ancho = [], 0.0
        for tk in linea:
            px = base * esc * (1.18 if tk["emph"] else 1.0)
            grupo, gw = [], 0.0
            for tipo, txt in tk["p"]:
                if tipo == "t":
                    color = "accent" if (tk["emph"] and not marcador) else "text"
                    cols = {"accent": colors["accent"], "text": colores_inv} if (tk["emph"] and marcador) else colors
                    spr = _recorte(R.title_sprite({"id": "k", "text": txt, "size": "L", "pxf": px / H, "color": color, "anim": "fade", "start": 0.0, "end": 99.0}, style, W, H, cols))
                else:
                    e = _emoji_sprite(txt, px * 0.95)
                    if not e:
                        continue
                    spr = _recorte((e[0], e[1]))
                grupo.append({"spr": spr, "dx": gw})
                gw += spr[2] + px * 0.08
            if not grupo:
                continue
            gw -= px * 0.08
            items.append({"g": grupo, "w": gw, "px": px, "emph": tk["emph"], "s": tk["s"], "x": ancho})
            ancho += gw + px * 0.26
        ancho -= px * 0.26 if items else 0
        k = min(1.0, 0.88 * W / max(ancho, 1))
        alto = max([max(g["spr"][3] for g in it["g"]) for it in items] + [1]) if items else 1
        cuerpo.append({"items": items, "w": ancho, "k": k, "h": alto})
    alto_total = sum(l["h"] * l["k"] * 1.18 for l in cuerpo)
    fy = min(1.0, 0.86 * H / max(alto_total, 1))
    return {"lineas": cuerpo, "fy": fy, "alto": alto_total * fy, "marcador": marcador}


def _rebote_salida(u):
    n1, d1 = 7.5625, 2.75
    if u < 1 / d1:
        return n1 * u * u
    if u < 2 / d1:
        u -= 1.5 / d1
        return n1 * u * u + 0.75
    if u < 2.5 / d1:
        u -= 2.25 / d1
        return n1 * u * u + 0.9375
    u -= 2.625 / d1
    return n1 * u * u + 0.984375


def _estado_entrada(anim, wd):
    """(escala, dx, dy, alfa, revelado, desenfoque) de una palabra que lleva wd segundos en pantalla."""
    c = R.clamp
    sc, dy, al, rev, bl = 1.0, 0.0, c(wd / 0.08), 1.0, 0.0
    if anim == "deslizar":
        dy, al = (1 - R.ease_out(c(wd / 0.3))) * 0.05, c(wd / 0.2)
    elif anim == "caer":
        dy, al = -(1 - _rebote_salida(c(wd / 0.5))) * 0.12, c(wd / 0.06)
    elif anim == "escribir":
        rev, al = c(wd / 0.22), 1.0
    elif anim == "desenfoque":
        bl, al = (1 - c(wd / 0.3)) * 14, c(wd / 0.22)
    elif anim == "zoom":
        sc, al = 2.2 - 1.2 * R.ease_out(c(wd / 0.28)), c(wd / 0.12)
    elif anim == "rebote":
        u = c(wd / 0.6)
        sc = 1 - math.exp(-6 * u) * math.cos(14 * u) * 0.35
    elif anim == "resorte":
        u = c(wd / 1.0)
        sc, al = 1 - 0.22 * math.exp(-5.5 * u) * math.cos(19 * u), c(wd / 0.05)
    else:  # pop
        u = c(wd / 0.22)
        sc = (0.7 + 0.4 * R.ease_out(u / 0.55)) if u < 0.55 else (1.1 - 0.1 * R.ease_out((u - 0.55) / 0.45))
    return sc, dy, al, rev, bl


def _dibujar_frase(dst, ev, obj, t, W, H, colors):
    tail = ev["end"] - t
    if t < ev["start"] - 0.02 or tail <= 0:
        return
    anim, salida = ev.get("anim", "pop"), ev.get("salida", "fade")
    v = 1 - R.clamp(tail / 0.25) if salida != "corte" else 0.0
    s_dy, s_sc, s_al = {"subir": (-0.06 * v, 1.0, 1 - v), "bajar": (0.06 * v, 1.0, 1 - v), "encoger": (0.0, 1 - 0.3 * v, 1 - v), "fade": (0.0, 1.0, 1 - v)}.get(salida, (0.0, 1.0, 1.0))
    y0 = float(ev["y"]) if ev.get("y") is not None else 0.5
    top = H * y0 - obj["alto"] / 2
    acc = colors["accent"][::-1]
    for ln in obj["lineas"]:
        alto_l = ln["h"] * ln["k"] * obj["fy"] * 1.18
        cy = top + alto_l / 2
        top += alto_l
        x_ini = W / 2 - ln["w"] * ln["k"] / 2
        for it in ln["items"]:
            wd = t - (it["s"] - 0.03)
            if wd < 0:
                continue
            sc, dy, al, rev, bl = _estado_entrada(anim, wd)
            al *= s_al
            if al <= 0.01:
                continue
            k = ln["k"] * obj["fy"]
            gx = x_ini + it["x"] * ln["k"]
            if obj["marcador"] and it["emph"]:
                pad = it["px"] * 0.12 * k
                ancho = it["w"] * k * R.ease_out(R.clamp(wd / 0.22))
                ov = dst.copy()
                cv2.rectangle(ov, (int(gx - pad), int(cy - it["px"] * 0.55 * k)), (int(gx + ancho + pad), int(cy + it["px"] * 0.45 * k)), acc, -1)
                cv2.addWeighted(ov, 0.92 * al, dst, 1 - 0.92 * al, 0, dst)
            for pz in it["g"]:
                rgb, a, iw, ih, off = pz["spr"]
                sk = k * sc * s_sc
                cx = gx + (pz["dx"] + iw / 2) * k
                py = cy + H * (dy + s_dy)
                if bl > 0.5:
                    kb = int(bl) | 1
                    rgb, a = cv2.GaussianBlur(rgb, (kb, kb), 0), cv2.GaussianBlur(a, (kb, kb), 0)
                if rev < 1:
                    a = a.copy()
                    a[:, int(a.shape[1] * rev):] = 0
                _blit_scaled(dst, (rgb, a), cx - off * k * sc * s_sc, py, al, sk)


# ---------- gráficos esenciales: rótulo, llamada, etiqueta y sección (mismas medidas que live.js) ----------
OSCURO = (24, 24, 24)


def _lum(rgb):
    return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]


def _sobre(rgb):
    """Color de texto legible sobre un fondo de este color: oscuro si el fondo es claro, blanco si es oscuro."""
    return OSCURO if _lum(rgb) > 140 else (255, 255, 255)


def _factor(ev):
    return {"S": 0.045, "M": 0.06, "L": 0.075, "XL": 0.09}.get(ev.get("size", "M"), 0.06)


def _lineas(ev):
    return [str(x) for x in ev.get("items", []) if str(x).strip()]


def _ancho(texto, pxf, style, W, H):
    """Ancho del texto en píxeles, igual que lo mide live.js."""
    its = [(w, style["font"], None) for w in R.caso_texto(texto, style.get("titulosCaso", "mayus")).split()]
    tr = style["tracking"]
    w200 = R.line_width(its, 200, tr * 200)
    px = max(min(pxf * H, 200 * 0.9 * W / max(w200, 1)), 16)
    return R.line_width(its, px, tr * px)


def _preparar_nuevo(ev, style, W, H, colors):
    if ev["kind"] == "clip":
        return {"ruta": str(BROLL / str(ev.get("archivo", ""))) if BROLL else "", "cap": None, "idx": -9, "frame": None, "fps": 30.0, "n": 0, "img": None, "ok": True}
    k, its, f = ev["kind"], _lineas(ev), _factor(ev)
    oscuro = {**colors, "text": _sobre(colors["accent"])}
    acento = "accent" if _lum(colors["accent"]) >= 90 else "text"  # un acento muy oscuro no se lee sobre fondo oscuro
    t0, t1 = (its[0] if its else ""), (its[1] if len(its) > 1 else "")
    sp = lambda txt, pxf, col, cs=colors: _sprite(txt, pxf, col, style, W, H, cs) if txt else None
    if k == "rotulo":
        return {"n": sp(t0, f * 0.75, "text"), "c": sp(t1, f * 0.5, acento), "wn": _ancho(t0, f * 0.75, style, W, H) if t0 else 0, "wc": _ancho(t1, f * 0.5, style, W, H) if t1 else 0}
    if k == "llamada":
        return {"t": sp(t0, f * 0.7, "text", oscuro), "w": _ancho(t0, f * 0.7, style, W, H) if t0 else 0}
    if k == "etiqueta":
        return {"t": sp(t0, f * 0.8, "text", oscuro), "w": _ancho(t0, f * 0.8, style, W, H) if t0 else 0}
    return {"t": sp(t0, f * 1.1, "text"), "n": sp(t1, 0.12, acento)}


def _caja(dst, x0, y0, x1, y1, r, bgr, alpha):
    """Rectángulo redondeado mezclado con lo que hay debajo."""
    from PIL import Image, ImageDraw
    X0, Y0, X1, Y1 = max(int(x0), 0), max(int(y0), 0), min(int(x1), dst.shape[1]), min(int(y1), dst.shape[0])
    if X1 <= X0 or Y1 <= Y0 or alpha <= 0:
        return
    S = 3  # supersample para bordes suaves
    m = Image.new("L", ((X1 - X0) * S, (Y1 - Y0) * S), 0)
    ImageDraw.Draw(m).rounded_rectangle((int((x0 - X0) * S), int((y0 - Y0) * S), int((x1 - X0) * S) - 1, int((y1 - Y0) * S) - 1), radius=int(r * S), fill=255)
    a = (np.asarray(m.resize((X1 - X0, Y1 - Y0), Image.LANCZOS), np.float32) / 255.0 * alpha)[..., None]
    roi = dst[Y0:Y1, X0:X1].astype(np.float32)
    dst[Y0:Y1, X0:X1] = (roi * (1 - a) + np.array(bgr, np.float32) * a).astype(np.uint8)


def _dibujar_nuevo(dst, ev, obj, t, W, H, colors):
    if ev["kind"] == "clip":
        return _dibujar_clip(dst, ev, obj, t, W, H)
    k, d = ev["kind"], t - ev["start"]
    alpha = R.clamp(d / 0.2) * R.clamp((ev["end"] - t) / 0.25)
    if alpha <= 0.01:
        return
    f, acc = _factor(ev), colors["accent"][::-1]
    y0 = float(ev["y"]) if ev.get("y") is not None else None
    if k == "rotulo":
        if not obj["n"]:
            return
        pn, pc, p, bar = f * 0.75 * H, f * 0.5 * H, 0.022 * H, max(6, 0.007 * H)
        nh, ch_, gap = pn * 1.12, (f * 0.5 * H * 1.12 if obj["c"] else 0), (0.004 * H if obj["c"] else 0)
        bh = 2 * p + nh + gap + ch_
        bw = bar + 2 * p + max(obj["wn"], obj["wc"])
        left, cy = 0.05 * W, H * (0.78 if y0 is None else y0)
        top = cy - bh / 2
        dx = -(1 - R.ease_out(R.clamp(d / 0.4))) * (bw + left)
        _caja(dst, left + dx, top, left + dx + bw, top + bh, 0.012 * H, (0, 0, 0), alpha * 0.7)
        _caja(dst, left + dx, top, left + dx + bar, top + bh, 0, acc, alpha)
        tx = left + dx + bar + p
        _blit_scaled(dst, obj["n"], tx + obj["wn"] / 2, top + p + nh / 2, alpha)
        if obj["c"]:
            _blit_scaled(dst, obj["c"], tx + obj["wc"] / 2, top + p + nh + gap + ch_ / 2, alpha)
    elif k == "llamada":
        if not obj["t"]:
            return
        px, p = f * 0.7 * H, 0.016 * H
        pw, ph = obj["w"] + 3 * p, px * 1.12 + 2 * p
        X, Y = float(ev.get("x", 0.7)) * W, (0.45 if y0 is None else y0) * H
        cx = X + 0.2 * W if X < 0.5 * W else X - 0.2 * W
        cx = min(max(cx, pw / 2 + 0.03 * W), W - pw / 2 - 0.03 * W)
        cy = Y - 0.12 * H
        u = R.ease_out(R.clamp((d - 0.1) / 0.35))
        ax, ay = cx, cy + ph / 2
        ov = dst.copy()
        cv2.line(ov, (int(ax), int(ay)), (int(ax + (X - ax) * u), int(ay + (Y - ay) * u)), acc, max(int(0.004 * H), 3), cv2.LINE_AA)
        cv2.circle(ov, (int(X), int(Y)), int(0.009 * H * u), acc, -1, cv2.LINE_AA)
        cv2.addWeighted(ov, alpha, dst, 1 - alpha, 0, dst)
        _caja(dst, cx - pw / 2, cy - ph / 2, cx + pw / 2, cy + ph / 2, ph / 2, acc, alpha)
        _blit_scaled(dst, obj["t"], cx, cy, alpha)
    elif k == "etiqueta":
        if not obj["t"]:
            return
        px, p = f * 0.8 * H, 0.014 * H
        pw, ph = obj["w"] + 4 * p, px * 1.12 + 2 * p
        u = R.clamp(d / 0.3)
        sc = 0.7 + 0.3 * u + 0.2 * math.sin(math.pi * u)
        cx, cy = W / 2, H * (0.2 if y0 is None else y0)
        _caja(dst, cx - pw * sc / 2, cy - ph * sc / 2, cx + pw * sc / 2, cy + ph * sc / 2, ph * sc / 2, acc, alpha)
        _blit_scaled(dst, obj["t"], cx, cy, alpha, sc)
    elif k == "seccion":
        if not obj["t"]:
            return
        ov = dst.copy()
        cv2.rectangle(ov, (0, 0), (W, H), (0, 0, 0), -1)
        cv2.addWeighted(ov, alpha * 0.4, dst, 1 - alpha * 0.4, 0, dst)
        yy = 0.45 if y0 is None else y0
        rise = (1 - R.ease_out(R.clamp(d / 0.4))) * 0.03 * H
        ta = alpha * R.clamp(d / 0.25)
        if obj["n"]:
            _blit_scaled(dst, obj["n"], W / 2, H * (yy - 0.03) + rise, ta)
            _blit_scaled(dst, obj["t"], W / 2, H * (yy + 0.07) + rise, ta)
        else:
            _blit_scaled(dst, obj["t"], W / 2, H * yy + rise, ta)


# ---------- B-roll: video o imagen extra encima del tuyo (mismas reglas que live.js) ----------
def _cuadro_clip(ev, obj, d):
    """El cuadro del clip que toca en el instante d desde que empieza (los videos se leen seguidos; si hay salto, se busca)."""
    ruta = obj["ruta"]
    if not obj["ok"] or not ruta:
        return None
    if not re.search(r"\.(mp4|mov|m4v|webm)$", ruta, re.I):
        if obj["img"] is None:
            obj["img"] = cv2.imread(ruta)
            obj["ok"] = obj["img"] is not None
        return obj["img"]
    if obj["cap"] is None:
        obj["cap"] = cv2.VideoCapture(ruta)
        obj["fps"] = obj["cap"].get(cv2.CAP_PROP_FPS) or 30.0
        obj["n"] = int(obj["cap"].get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        obj["ok"] = obj["cap"].isOpened()
        if not obj["ok"]:
            return None
    idx = int((float(ev.get("desde", 0)) + d) * obj["fps"])
    if obj["n"] > 0:
        idx = min(idx, obj["n"] - 2)  # se queda en el último cuadro
    idx = max(idx, 0)
    if idx != obj["idx"]:
        if idx != obj["idx"] + 1:
            obj["cap"].set(cv2.CAP_PROP_POS_FRAMES, idx)
        ok, fr = obj["cap"].read()
        if ok:
            obj["frame"], obj["idx"] = fr, idx
    return obj["frame"]


def _dibujar_clip(dst, ev, obj, t, W, H):
    d, tail = t - ev["start"], ev["end"] - t
    if d < 0 or tail <= 0:
        return
    al = R.clamp(d / 0.2) * R.clamp(tail / 0.25)
    if al <= 0.01:
        return
    fr = _cuadro_clip(ev, obj, d)
    if fr is None:
        return
    fh, fw = fr.shape[:2]
    if ev.get("modo") == "ventana":
        w = max(int(round(max(kf_valor(ev, "ancho", d, float(ev.get("ancho", 0.5))), 0.05) * W)), 8)
        h = max(int(round(w * fh / fw)), 8)
        img = cv2.resize(fr, (w, h), interpolation=cv2.INTER_AREA if w < fw else cv2.INTER_LINEAR)
        x0, y0 = int(round(W * kf_valor(ev, "x", d, float(ev.get("x", 0.5))) - w / 2)), int(round(H * kf_valor(ev, "y", d, float(ev.get("y", 0.3))) - h / 2))
        from PIL import Image, ImageDraw
        m = Image.new("L", (w, h), 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), radius=int(min(w, h) * 0.06), fill=255)
        mask = np.asarray(m, np.float32) / 255.0 * al
        X0, Y0, X1, Y1 = max(x0, 0), max(y0, 0), min(x0 + w, W), min(y0 + h, H)
        if X1 <= X0 or Y1 <= Y0:
            return
        a = mask[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0, None]
        roi = dst[Y0:Y1, X0:X1].astype(np.float32)
        dst[Y0:Y1, X0:X1] = (roi * (1 - a) + img[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0].astype(np.float32) * a).astype(np.uint8)
    else:
        sc = max(W / fw, H / fh) * max(kf_valor(ev, "escala", d, float(ev.get("escala", 1) or 1)), 1.0)  # escala > 1 acerca; fx y fy eligen qué parte se ve
        nw, nh = max(int(round(fw * sc)), W), max(int(round(fh * sc)), H)
        img = cv2.resize(fr, (nw, nh), interpolation=cv2.INTER_AREA if sc < 1 else cv2.INTER_LINEAR)
        fx_, fy_ = kf_valor(ev, "fx", d, float(ev.get("fx", 0.5))), kf_valor(ev, "fy", d, float(ev.get("fy", 0.5)))
        x0, y0 = int(round((nw - W) * min(max(fx_, 0), 1))), int(round((nh - H) * min(max(fy_, 0), 1)))
        cv2.addWeighted(dst, 1 - al, img[y0:y0 + H, x0:x0 + W], al, 0, dst)
