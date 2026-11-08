"""Separa a la persona del fondo con Robust Video Matting y guarda la máscara como video."""
import os, subprocess
from pathlib import Path
import cv2, numpy as np, onnxruntime as ort
from common import correr_tramos, ffmpeg_exe, encoder_args, ensure_model, hilos_auto, status

CALENTAR = 60  # el modelo recuerda el cuadro anterior: cada tramo arranca unos cuadros antes y los descarta


def run(proj, long_side=768, ratio=0.4, base=50, span=45, hilos=None, tramo=None, salida=None):
    """tramo=(k0, k1) y salida: modo trabajador, recorta solo esos cuadros (k1=None: hasta el final). hilos=1 fuerza un solo proceso."""
    proj = Path(proj)
    long_side = int(os.environ.get("ESTUDIO_MATTE_LADO", long_side))  # los procesos hijos heredan esto
    ratio = float(os.environ.get("ESTUDIO_MATTE_RATIO", ratio))
    cap = cv2.VideoCapture(str(proj / "source.mp4"))
    W, H = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    n_h = hilos if hilos is not None else hilos_auto()
    if not tramo and n_h > 1 and total >= 600:  # shortcut: por debajo de ~20 s no vale arrancar procesos
        cap.release()
        lim = [round(total * j / n_h) for j in range(n_h + 1)]
        correr_tramos(proj, "matte", [f"{lim[j]}:{lim[j + 1] if j < n_h - 1 else ''}" for j in range(n_h)], [], total,
                      lambda h: status(proj, "recortar", base + span * h / max(total, 1), f"Fotograma {h} de {total}"), proj / "alpha.mp4")
        status(proj, "recortar", base + span, f"Listo: {total} fotogramas")
        return
    so = ort.SessionOptions()
    if tramo:
        so.intra_op_num_threads = 1  # un hilo por proceso: con varios procesos a la vez rinde más que uno solo con todos los hilos
    sess = ort.InferenceSession(str(ensure_model()), so, providers=["CPUExecutionProvider"])
    k0, k1 = tramo or (0, None)
    n = max(k0 - CALENTAR, 0)
    if n:
        cap.set(cv2.CAP_PROP_POS_FRAMES, n)
    s = long_side / max(W, H)
    w, h = int(round(W * s / 2) * 2), int(round(H * s / 2) * 2)
    rec = [np.zeros((1, 1, 1, 1), np.float32) for _ in range(4)]
    dr = np.array([ratio], np.float32)
    out = Path(salida) if tramo else proj / "alpha.mp4"
    enc = subprocess.Popen([ffmpeg_exe(), "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{w}x{h}", "-r", f"{fps}",
                            "-i", "-", *encoder_args("final", 85), "-pix_fmt", "yuv420p", str(out)],
                           stdin=subprocess.PIPE)
    # Solo se recorta un cuadro de cada dos (el modelo es el cuello de botella); el cuadro intermedio es el promedio de sus vecinos.
    prev, odd_pend = None, False
    esc = lambda m: (np.clip(m, 0, 1) * 255).astype(np.uint8)
    while k1 is None or n <= k1:
        if n % 2:
            if not cap.grab():
                break
            odd_pend = True
            n += 1
            continue
        ok, f = cap.read()
        if not ok:
            break
        f = cv2.resize(f, (w, h), interpolation=cv2.INTER_AREA)
        x = cv2.cvtColor(f, cv2.COLOR_BGR2RGB).astype(np.float32).transpose(2, 0, 1)[None] / 255
        _, pha, *rec = sess.run(None, dict(src=x, r1i=rec[0], r2i=rec[1], r3i=rec[2], r4i=rec[3], downsample_ratio=dr))
        m = pha[0, 0]
        if odd_pend and prev is not None and k0 <= n - 1 < (k1 if k1 is not None else n):
            enc.stdin.write(esc((prev + m) / 2).tobytes())
        odd_pend = False
        if k0 <= n and (k1 is None or n < k1):
            enc.stdin.write(esc(m).tobytes())
        prev = m
        n += 1
        if n % 16 == 1:  # n ya avanzó un cuadro tras uno par
            if tramo:
                Path(str(out) + ".prog").write_text(str(max(n - k0, 0)))
            else:
                status(proj, "recortar", base + span * n / max(total, 1), f"Fotograma {n} de {total}")
    if odd_pend and prev is not None and n - 1 >= k0 and (k1 is None or n - 1 < k1):  # último cuadro impar: no tiene vecino siguiente
        enc.stdin.write(esc(prev).tobytes())
    cap.release()
    enc.stdin.close()
    enc.wait()
    if not tramo:
        status(proj, "recortar", base + span, f"Listo: {n} fotogramas")
