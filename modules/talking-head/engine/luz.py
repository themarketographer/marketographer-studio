"""Mide el fondo detrás de ti (sin contarte a ti) para sugerir qué color y qué degradado dan contraste a los textos."""
import cv2
import numpy as np
from pathlib import Path
from common import probe, save


def run(proj):
    proj = Path(proj)
    W, H, fps, dur = probe(proj / "source.mp4")
    cap, acap = cv2.VideoCapture(str(proj / "source.mp4")), cv2.VideoCapture(str(proj / "alpha.mp4"))
    bandas = {"arriba": (0.0, 0.33), "centro": (0.33, 0.66), "abajo": (0.66, 1.0)}
    lum = {k: [] for k in bandas}
    rgb = []
    for i in range(10):
        n = int((0.05 + 0.9 * i / 9) * dur * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, n); acap.set(cv2.CAP_PROP_POS_FRAMES, n)
        ok, f = cap.read(); ok2, a = acap.read()
        if not ok:
            continue
        f = cv2.resize(f, (216, 384))
        m = (cv2.resize(a[:, :, 0], (216, 384)) < 60) if ok2 else np.ones((384, 216), bool)
        y = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
        for k, (a0, a1) in bandas.items():
            mm = m[int(a0 * 384):int(a1 * 384)]
            if mm.sum() > 50:
                lum[k].append(float(y[int(a0 * 384):int(a1 * 384)][mm].mean()))
        top = f[:int(0.33 * 384)][m[:int(0.33 * 384)]]
        if len(top):
            rgb.append(top.mean(axis=0)[::-1])
    cap.release(); acap.release()
    media = {k: round(float(np.mean(v)), 3) if v else 0.5 for k, v in lum.items()}
    c = np.mean(rgb, axis=0) if rgb else np.array([128, 128, 128])
    res = {"luz": media, "color": "#%02x%02x%02x" % tuple(int(x) for x in c)}
    save(proj, "luz.json", res)
    return res
