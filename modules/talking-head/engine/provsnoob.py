"""Pro vs Noob: dos tomas en la misma pantalla vertical, cada una con su etiqueta animada.

Reutiliza el texto, las entradas y la mezcla de audio del resto del motor."""
import subprocess
from pathlib import Path
import cv2
import numpy as np
import render as R
import graficos as G
from common import ffmpeg_exe, probe, load, save, status, merge_style

W, H, FPS = 1080, 1920, 30


def _cubrir(frame, pw, ph):
    h, w = frame.shape[:2]
    k = max(pw / w, ph / h)
    img = cv2.resize(frame, None, fx=k, fy=k, interpolation=cv2.INTER_AREA if k < 1 else cv2.INTER_LINEAR)
    y0, x0 = (img.shape[0] - ph) // 2, (img.shape[1] - pw) // 2
    return img[y0:y0 + ph, x0:x0 + pw]


def _etiqueta(texto, color, style, tam="L"):
    cols = {"accent": R.hex_rgb(color), "text": (255, 255, 255)}
    ev = {"text": texto.upper(), "size": tam, "color": "accent", "pxf": 0.045}
    rgb, a = R.title_sprite(ev, style, W, H, cols)
    return R.with_box(rgb, a, 0.045 * H)


def _pastilla(texto, color, style):
    cols = {"accent": (255, 255, 255), "text": (255, 255, 255)}
    rgb, a = R.title_sprite({"text": texto, "size": "M", "color": "text", "pxf": 0.04}, style, W, H, cols)
    d = int(max(rgb.shape[:2]) * 1.5) | 1
    lienzo = np.zeros((d, d, 3), np.uint8)
    alfa = np.zeros((d, d), np.uint8)
    cv2.circle(lienzo, (d // 2, d // 2), d // 2 - 2, R.hex_rgb(color)[::-1], -1, cv2.LINE_AA)
    cv2.circle(alfa, (d // 2, d // 2), d // 2 - 2, 255, -1, cv2.LINE_AA)
    h, w = a.shape
    y0, x0 = (d - h) // 2, (d - w) // 2
    af = a.astype(np.float32)[..., None] / 255.0
    lienzo[y0:y0 + h, x0:x0 + w] = (lienzo[y0:y0 + h, x0:x0 + w] * (1 - af) + rgb * af).astype(np.uint8)
    return lienzo, alfa


def _poner(dst, spr, cx, cy, t, t0, anim):
    d = t - t0
    if d < 0:
        return
    sc, dy, al, rev, bl = G._estado_entrada(anim, d)
    rgb, a = spr
    if bl > 0.5:
        k = int(bl) | 1
        rgb, a = cv2.GaussianBlur(rgb, (k, k), 0), cv2.GaussianBlur(a, (k, k), 0)
    if rev < 1:
        a = a.copy()
        a[:, int(a.shape[1] * rev):] = 0
    G._blit_scaled(dst, (rgb, a), cx, cy + dy * H, min(al, 1.0), max(sc, 0.05))


def run(proj):
    proj = Path(proj)
    cfg = load(proj, "pvn.json", {})
    style = merge_style(None)
    A, B = cfg.get("a", {}), cfg.get("b", {})
    nombreA, nombreB = (A.get("nombre") or "NOOB"), (B.get("nombre") or "PRO")
    colA, colB = (A.get("color") or "#ff4d4d"), (B.get("color") or "#2fd27a")
    lado = cfg.get("layout") == "lado"
    anim = cfg.get("anim", "pop")
    fa, fb = proj / "a.mp4", proj / "b.mp4"
    da, db = probe(fa)[3], probe(fb)[3]
    dur = {"a": da, "b": db}.get(cfg.get("duracion"), min(da, db))
    dur = max(min(dur, 180.0), 0.5)
    pw, ph = (W // 2, H) if lado else (W, H // 2)
    capA, capB = cv2.VideoCapture(str(fa)), cv2.VideoCapture(str(fb))
    fpsA, fpsB = capA.get(cv2.CAP_PROP_FPS) or 30, capB.get(cv2.CAP_PROP_FPS) or 30
    spA, spB = _etiqueta(nombreA, colA, style), _etiqueta(nombreB, colB, style)
    vs = _pastilla("VS", "#111111", style) if cfg.get("vs", True) else None
    tit = None
    if (cfg.get("titulo") or "").strip():
        rgb, a = R.title_sprite({"text": cfg["titulo"].strip(), "size": "M", "color": "text", "pxf": 0.04}, style, W, H, {"accent": R.hex_rgb(colB), "text": (255, 255, 255)})
        tit = R.with_box(rgb, a, 0.04 * H)
    # Las etiquetas van en la esquina superior izquierda de cada toma, para no tapar la cara.
    ha, wa, hb, wb = spA[1].shape[0], spA[1].shape[1], spB[1].shape[0], spB[1].shape[1]
    posA = (40 + wa / 2, 40 + ha / 2)
    posB = ((pw + 40 + wb / 2, 40 + hb / 2) if lado else (40 + wb / 2, ph + 40 + hb / 2))
    n = int(dur * FPS)
    out_tmp = proj / "_pvn.mp4"
    enc = subprocess.Popen([ffmpeg_exe(), "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p", str(out_tmp)], stdin=subprocess.PIPE)
    ia, ib = -1, -1
    fra, frb = None, None
    for i in range(n):
        t = i / FPS
        na, nb = int(t * fpsA), int(t * fpsB)
        while ia < na:
            ok, f = capA.read()
            if not ok:
                break
            fra, ia = f, ia + 1
        while ib < nb:
            ok, f = capB.read()
            if not ok:
                break
            frb, ib = f, ib + 1
        lienzo = np.full((H, W, 3), 12, np.uint8)
        if fra is not None:
            pa = _cubrir(fra, pw, ph)
            lienzo[0:ph, 0:pw] = pa
        if frb is not None:
            pb = _cubrir(frb, pw, ph)
            if lado:
                lienzo[0:ph, pw:W] = pb
            else:
                lienzo[ph:H, 0:W] = pb
        if lado:
            cv2.rectangle(lienzo, (pw - 3, 0), (pw + 3, H), (12, 12, 12), -1)
        else:
            cv2.rectangle(lienzo, (0, ph - 3), (W, ph + 3), (12, 12, 12), -1)
        _poner(lienzo, spA, posA[0], posA[1], t, 0.15, anim)
        _poner(lienzo, spB, posB[0], posB[1], t, 0.5, anim)
        if vs:
            _poner(lienzo, vs, W / 2 if not lado else pw, H / 2 if lado else ph, t, 0.8, "pop")
        if tit:
            _poner(lienzo, tit, W / 2, H * 0.93, t, 0.3, "deslizar")
        enc.stdin.write(memoryview(lienzo))
        if i % 15 == 0:
            status(proj, "render", 5 + 85 * i / n, "Montando el video")
    enc.stdin.close()
    enc.wait()
    # Audio: la voz del Pro, la del Noob o las dos mezcladas.
    modo = cfg.get("audio", "b")
    ff = ffmpeg_exe()
    base = [ff, "-v", "error", "-y", "-i", str(out_tmp), "-i", str(fa), "-i", str(fb)]
    fin = proj / "final.mp4"
    if modo == "a":
        af = ["-map", "0:v", "-map", "1:a:0"]
    elif modo == "mezcla":
        af = ["-filter_complex", "[1:a:0][2:a:0]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.97[m]", "-map", "0:v", "-map", "[m]"]
    else:
        af = ["-map", "0:v", "-map", "2:a:0"]
    try:
        subprocess.run(base + af + ["-t", f"{dur:.3f}", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(fin)], check=True)
    except subprocess.CalledProcessError:  # alguna toma sin audio: se entrega el video sin sonido
        subprocess.run([ff, "-v", "error", "-y", "-i", str(out_tmp), "-c", "copy", "-movflags", "+faststart", str(fin)], check=True)
    out_tmp.unlink(missing_ok=True)
    status(proj, "listo", 100, "final.mp4")
