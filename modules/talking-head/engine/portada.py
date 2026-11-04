"""Portada: un fotograma del video con el título detrás de ti, delante o arriba. Sale en el formato del video: 1080x1920, 1920x1080, 1080x1080 o 1080x1350 (PNG)."""
import json
import cv2
import numpy as np
from pathlib import Path
from common import load, merge_style, probe, formato_de, encuadre_de, encuadrar, NOMINAL
import render


def fotograma(path, t, fps):
    cap = cv2.VideoCapture(str(path))
    cap.set(cv2.CAP_PROP_POS_FRAMES, max(int(round(t * fps)), 0))
    ok, f = cap.read()
    cap.release()
    return f if ok else None


def run(proj, t, texto, pos="detras", size="XL", color="accent", y=None, salida="portada.png"):
    proj = Path(proj)
    plan = load(proj, "plan.json", {})
    style = merge_style(plan.get("style"))
    W0, H0, fps, dur = probe(proj / "source.mp4")
    t = min(max(t, 0), max(dur - 0.05, 0))
    f = fotograma(proj / "source.mp4", t, fps)
    if f is None:
        raise RuntimeError("No pude leer ese momento del video.")
    # El video original puede ser más grande: la portada sale siempre en el tamaño estándar del formato.
    fmt, (fx, fy) = formato_de(plan, W0, H0), encuadre_de(plan)
    W, H = NOMINAL[fmt]
    f = encuadrar(f, fmt, fx, fy)
    f = cv2.resize(f, (W, H), interpolation=cv2.INTER_AREA if f.shape[1] > W else cv2.INTER_CUBIC)
    af = fotograma(proj / "alpha.mp4", t, fps)
    a = cv2.resize(encuadrar(af, fmt, fx, fy)[:, :, 0], (W, H)) if af is not None else np.zeros((H, W), np.uint8)
    look, vig = render.make_look(style, W, H)
    peli = render.Pelicula(style, W, H)
    f = peli.fondo(look(f), a)
    colors = {"accent": render.hex_rgb(style["accent"]), "text": render.hex_rgb(style["text"])}
    ev = {"id": "portada", "text": texto.strip() or "Título", "size": size, "color": color, "anim": "fade", "start": 0.0, "end": 99.0, "y": y}
    spr = render.title_sprite(ev, style, W, H, colors)
    ev_t = 1.0  # tiempo en que la animación ya terminó
    if pos == "detras":
        layer = f.copy()
        if float(style["desenfoque"]) > 0:
            small = cv2.GaussianBlur(cv2.resize(f, (W // 6, H // 6), interpolation=cv2.INTER_AREA), (0, 0), 4.2)
            bl = cv2.convertScaleAbs(cv2.resize(small, (W, H), interpolation=cv2.INTER_LINEAR), alpha=0.5)
            w = min(float(style["desenfoque"]), 1.0)
            layer = cv2.addWeighted(f, 1 - w, bl, w, 0)
        render.draw_event(layer, spr, {**ev, "pos": "detras"}, ev_t, W, H)
        a3 = cv2.merge([a, a, a])
        out = cv2.add(cv2.multiply(f, a3, scale=1 / 255.0), cv2.multiply(layer, cv2.bitwise_not(a3), scale=1 / 255.0))
        out = vig(peli.global_(out, a))
    else:
        out = vig(peli.global_(f, a))
        render.draw_event(out, spr, {**ev, "pos": pos}, ev_t, W, H)
    dest = proj / (salida if salida.startswith("portada") and salida.endswith(".png") else "portada.png")
    cv2.imwrite(str(dest), out)
    return dest


def _cascada(nombre):
    return cv2.CascadeClassifier(str(Path(cv2.data.haarcascades) / nombre))


def candidatos(proj, n=6):
    """Elige los mejores fotogramas para la portada: cara grande y centrada, ojos abiertos, nítida y bien iluminada."""
    proj = Path(proj)
    W0, H0, fps, dur = probe(proj / "source.mp4")
    words = load(proj, "words.json", {"words": []})["words"]
    tiempos = []
    t = 0.3
    while t < dur - 0.2:
        if not words or any(w["start"] - 0.1 <= t <= w["end"] + 0.1 for w in words):
            tiempos.append(round(t, 2))
        t += 0.35
    try:
        cara, ojos = _cascada("haarcascade_frontalface_default.xml"), _cascada("haarcascade_eye.xml")
    except Exception:
        cara = ojos = None  # sin detector de caras se usa el recorte de tu silueta
    cap = cv2.VideoCapture(str(proj / "source.mp4"))
    acap = cv2.VideoCapture(str(proj / "alpha.mp4")) if (proj / "alpha.mp4").exists() else None
    puntaje = []
    for t in tiempos:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(round(t * fps)))
        ok, f = cap.read()
        if not ok:
            continue
        sc = 360.0 / f.shape[1]
        g = cv2.cvtColor(cv2.resize(f, None, fx=sc, fy=sc), cv2.COLOR_BGR2GRAY)
        if cara is not None:
            caras = cara.detectMultiScale(g, 1.15, 5, minSize=(40, 40))
            if len(caras) == 0:
                continue
            x, y, w, h = max(caras, key=lambda c: c[2] * c[3])
            ab = len(ojos.detectMultiScale(g[y:y + h, x:x + w][: int(h * 0.62)], 1.1, 6, minSize=(w // 10, w // 10)))
        else:  # cabeza = parte alta de tu silueta
            if acap is None:
                continue
            acap.set(cv2.CAP_PROP_POS_FRAMES, int(round(t * fps)))
            ok2, af = acap.read()
            if not ok2:
                continue
            am = cv2.resize(af[:, :, 0], (g.shape[1], g.shape[0])) > 128
            ys, xs = np.where(am)
            if len(ys) < 200:
                continue
            y0 = ys.min()
            ancho = max(int((xs.max() - xs.min()) * 0.5), 40)
            cx = int(np.median(xs[ys < y0 + 40])) if np.any(ys < y0 + 40) else int(xs.mean())
            x, y, w, h = max(cx - ancho // 2, 0), y0, ancho, int(ancho * 1.2)
            ab = 2
        roc = g[y:y + h, x:x + w]
        if roc.size == 0:
            continue
        nit = min(cv2.Laplacian(roc, cv2.CV_64F).var() / 120.0, 1.5)
        cen = 1 - min(abs((x + w / 2) / g.shape[1] - 0.5) * 2, 1)
        lum = float(roc.mean()) / 255.0
        luz = 1 - min(abs(lum - 0.5) * 2, 1)
        tam = min(w / (g.shape[1] * 0.45), 1.2)
        score = nit * 1.2 + (1.2 if ab >= 2 else 0.0) + cen * 0.8 + luz * 0.6 + tam
        puntaje.append((score, t))
    cap.release()
    if acap is not None:
        acap.release()
    puntaje.sort(reverse=True)
    elegidos = []
    for s, t in puntaje:
        if all(abs(t - e) >= 1.2 for e in elegidos):
            elegidos.append(t)
        if len(elegidos) >= n:
            break
    if not elegidos:
        elegidos = [round(dur * k / (n + 1), 2) for k in range(1, n + 1)]
    out = []
    for i, t in enumerate(sorted(elegidos)):
        f = fotograma(proj / "source.mp4", t, fps)
        if f is None:
            continue
        f = cv2.resize(f, (360, int(360 * f.shape[0] / f.shape[1])), interpolation=cv2.INTER_AREA)
        cv2.imwrite(str(proj / f"cand_{i}.jpg"), f, [cv2.IMWRITE_JPEG_QUALITY, 82])
        out.append({"t": t, "img": i})
    (proj / "candidatos.json").write_text(json.dumps(out))
    return out


def miniatura(proj):
    proj = Path(proj)
    W0, H0, fps, dur = probe(proj / "source.mp4")
    f = fotograma(proj / "source.mp4", min(1.0, dur / 3), fps)
    if f is None:
        raise RuntimeError("No pude leer el video.")
    f = cv2.resize(f, (216, int(216 * f.shape[0] / f.shape[1])), interpolation=cv2.INTER_AREA)
    cv2.imwrite(str(proj / "thumb.jpg"), f, [cv2.IMWRITE_JPEG_QUALITY, 80])
