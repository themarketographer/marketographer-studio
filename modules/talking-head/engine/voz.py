"""Video de voz en off: convierte un audio en un video vertical con fondo (degradado, color o imagen).

El resto del editor lo trata como cualquier otro video. Como no hay persona, la silueta (alpha.mp4) es negra
y el fondo ocupa toda la pantalla."""
import subprocess
from pathlib import Path
import cv2
import numpy as np
from common import ffmpeg_exe, probe, status
import render as R

W, H, FPS = 1080, 1920, 30


def fondo(modo, c1, c2, imagen, carpeta_imgs):
    a = np.array(R.hex_rgb(c1 or "#2b1b4d")[::-1], np.float32)
    b = np.array(R.hex_rgb(c2 or "#0b0b12")[::-1], np.float32)
    if modo in ("blanco", "cuadricula", "negro", "cuadnegra"):
        oscuro = modo in ("negro", "cuadnegra")
        img = np.full((H, W, 3), (14, 14, 14) if oscuro else (250, 250, 248), np.uint8)
        if modo in ("cuadricula", "cuadnegra"):
            paso = 60
            linea = (46, 46, 46) if oscuro else (226, 226, 222)
            fuerte = (70, 70, 70) if oscuro else (205, 205, 200)
            for i, x in enumerate(range(0, W, paso)):
                img[:, x:x + 2] = fuerte if i % 4 == 0 else linea
            for i, y in enumerate(range(0, H, paso)):
                img[y:y + 2, :] = fuerte if i % 4 == 0 else linea
        return img
    if modo == "color":
        return np.full((H, W, 3), a, np.uint8)
    if modo == "imagen" and imagen:
        img = cv2.imread(str(Path(carpeta_imgs) / Path(imagen).name), cv2.IMREAD_COLOR)
        if img is not None:
            k = max(W / img.shape[1], H / img.shape[0])
            img = cv2.resize(img, None, fx=k, fy=k, interpolation=cv2.INTER_AREA if k < 1 else cv2.INTER_CUBIC)
            y0, x0 = (img.shape[0] - H) // 2, (img.shape[1] - W) // 2
            return (img[y0:y0 + H, x0:x0 + W].astype(np.float32) * 0.7).astype(np.uint8)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    u = np.clip(yy / H * 0.85 + xx / W * 0.15, 0, 1)[..., None]
    return (a * (1 - u) + b * u).astype(np.uint8)


def run(proj, audio, modo="degradado", c1="", c2="", imagen="", carpeta_imgs=None):
    proj = Path(proj)
    status(proj, "voz", 5, "Preparando el fondo")
    png = proj / "fondo_voz.png"
    cv2.imwrite(str(png), fondo(modo, c1, c2, imagen, carpeta_imgs or proj.parent.parent / "escenas"))
    ff = ffmpeg_exe()
    # Un video con la imagen fija y tu voz. Se limpia el audio a estéreo 44.1 kHz para que el resto del motor lo lea igual que siempre.
    subprocess.run([ff, "-v", "error", "-y", "-loop", "1", "-framerate", str(FPS), "-i", str(png), "-i", str(audio), "-map", "0:v", "-map", "1:a:0",
                    "-c:v", "libx264", "-preset", "veryfast", "-tune", "stillimage", "-pix_fmt", "yuv420p", "-r", str(FPS), "-c:a", "aac", "-ar", "44100", "-ac", "2",
                    "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(proj / "source.mp4")], check=True)
    status(proj, "voz", 40, "Preparando la silueta vacía")
    dur = probe(proj / "source.mp4")[3]
    subprocess.run([ff, "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=black:s={W // 4}x{H // 4}:r={FPS}", "-t", f"{dur:.3f}",
                    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", str(proj / "alpha.mp4")], check=True)
    png.unlink(missing_ok=True)
