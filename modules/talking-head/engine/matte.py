"""Separa a la persona del fondo con Robust Video Matting y guarda la máscara como video."""
import subprocess
from pathlib import Path
import cv2, numpy as np, onnxruntime as ort
from common import ffmpeg_exe, ensure_model, status


def run(proj, long_side=960, ratio=0.4, base=50, span=45):
    proj = Path(proj)
    model = ensure_model()
    sess = ort.InferenceSession(str(model), providers=["CPUExecutionProvider"])
    cap = cv2.VideoCapture(str(proj / "source.mp4"))
    W, H = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    s = long_side / max(W, H)
    w, h = int(round(W * s / 2) * 2), int(round(H * s / 2) * 2)
    rec = [np.zeros((1, 1, 1, 1), np.float32) for _ in range(4)]
    dr = np.array([ratio], np.float32)
    enc = subprocess.Popen([ffmpeg_exe(), "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{w}x{h}", "-r", f"{fps}",
                            "-i", "-", "-c:v", "libx264", "-crf", "12", "-preset", "veryfast", "-pix_fmt", "yuv420p", str(proj / "alpha.mp4")],
                           stdin=subprocess.PIPE)
    n = 0
    while True:
        ok, f = cap.read()
        if not ok:
            break
        f = cv2.resize(f, (w, h), interpolation=cv2.INTER_AREA)
        x = cv2.cvtColor(f, cv2.COLOR_BGR2RGB).astype(np.float32).transpose(2, 0, 1)[None] / 255
        _, pha, *rec = sess.run(None, dict(src=x, r1i=rec[0], r2i=rec[1], r3i=rec[2], r4i=rec[3], downsample_ratio=dr))
        enc.stdin.write((np.clip(pha[0, 0], 0, 1) * 255).astype(np.uint8).tobytes())
        n += 1
        if n % 15 == 0:
            status(proj, "recortar", base + span * n / max(total, 1), f"Fotograma {n} de {total}")
    cap.release()
    enc.stdin.close()
    enc.wait()
    status(proj, "recortar", base + span, f"Listo: {n} fotogramas")
