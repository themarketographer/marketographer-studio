"""Utilidades compartidas del motor: rutas, ffmpeg, estado de progreso y lectura de JSON."""
import functools, json, os, shutil, subprocess, sys, time, urllib.request
from pathlib import Path

ENGINE = Path(__file__).resolve().parent
FONTS = ENGINE / "fonts"
MODELS = ENGINE / "models"
RVM_URL = "https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/rvm_mobilenetv3_fp32.onnx"


def ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        p = shutil.which("ffmpeg")
        if p:
            return p
        raise RuntimeError("No encontré ffmpeg. Ejecuta Instalar.command de nuevo.")


# Calidad constante del chip; 75 iguala a libx264 crf 17 (SSIM 0.9926, medido 2026-11-05) con 12 % menos peso.
_Q = {"borrador": 55, "medio": 65, "final": 75}
_CRF = {"borrador": ("30", "ultrafast"), "medio": ("24", "veryfast"), "final": ("17", "veryfast")}


@functools.lru_cache(maxsize=None)
def _videotoolbox():
    out = subprocess.run([ffmpeg_exe(), "-hide_banner", "-encoders"], capture_output=True, text=True).stdout
    return "h264_videotoolbox" in out


def encoder_args(calidad="final", q=None):
    # El chip de video de la Mac; si no existe, respaldo con libx264 por software.
    if _videotoolbox():
        return ["-c:v", "h264_videotoolbox", "-q:v", str(q or _Q[calidad])]
    crf, preset = _CRF[calidad]
    return ["-c:v", "libx264", "-crf", crf, "-preset", preset]


def hilos_auto():
    # Núcleos de rendimiento de la Mac menos uno para el sistema, máximo 6; HILOS=1 fuerza un solo proceso.
    if os.environ.get("HILOS"):
        return int(os.environ["HILOS"])
    n = os.cpu_count() or 2
    if sys.platform == "win32":  # los procesadores de Windows cuentan hilos, no núcleos, y cada proceso carga el modelo en memoria: se usa la mitad
        return max(min(n // 2, 4), 1)
    return max(min(n - 1, 6), 1)


def correr_tramos(proj, accion, tramos, extra, total, avance, destino, simultaneos=None):
    """Un proceso del motor por tramo (cli.py <accion> --tramo a:b --salida parte): espera mostrando avance(hecho) y une las partes sin recodificar."""
    proj = Path(proj)
    partes = [proj / f"_{accion}{j}.mp4" for j in range(len(tramos))]
    lista = proj / f"_{accion}.txt"
    simultaneos = simultaneos or len(tramos)  # con más tramos que procesos, cada proceso que termina toma el siguiente: el trabajo se reparte parejo
    procs, pendientes = [], list(zip(tramos, partes))
    try:
        while True:
            vivos = sum(1 for pr in procs if pr.poll() is None)
            while pendientes and vivos < simultaneos:
                t, parte = pendientes.pop(0)
                procs.append(subprocess.Popen([sys.executable, str(ENGINE / "cli.py"), accion, str(proj), *extra, "--tramo", t, "--salida", str(parte)]))
                vivos += 1
            if not pendientes and vivos == 0:
                break
            if any(pr.poll() not in (None, 0) for pr in procs):
                break  # uno falló: no tiene sentido seguir con los demás
            hecho = 0
            for parte in partes:
                try:
                    hecho += int(Path(str(parte) + ".prog").read_text() or 0)
                except (OSError, ValueError):
                    pass
            avance(min(hecho, total))
            time.sleep(0.25)
        if pendientes or any(pr.returncode for pr in procs):
            raise RuntimeError(f"Falló uno de los tramos ({accion}).")
        lista.write_text("".join(f"file '{Path(parte).as_posix()}'\n" for parte in partes), encoding="utf-8")
        subprocess.run([ffmpeg_exe(), "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lista), "-c", "copy", str(destino)], check=True)
    finally:
        for pr in procs:
            if pr.poll() is None:
                pr.kill()
        for parte in partes:
            parte.unlink(missing_ok=True)
            Path(str(parte) + ".prog").unlink(missing_ok=True)
        lista.unlink(missing_ok=True)


def load(proj, name, default=None):
    p = Path(proj) / name
    if not p.exists():
        return default
    return json.loads(p.read_text(encoding="utf8"))


def save(proj, name, data):
    p = Path(proj) / name
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf8")
    os.replace(tmp, p)


def status(proj, etapa, pct, msg="", error=None):
    """Escribe status.json para que la interfaz muestre el progreso."""
    save(proj, "status.json", {"etapa": etapa, "pct": round(float(pct), 1), "msg": msg, "error": error})
    print(f"[{etapa}] {pct:.0f}% {msg}", flush=True)


def ensure_model():
    MODELS.mkdir(exist_ok=True)
    dst = MODELS / "rvm.onnx"
    if not dst.exists() or dst.stat().st_size < 10_000_000:
        print("Descargando el modelo de recorte (15 MB)...", flush=True)
        tmp = dst.with_suffix(".part")
        urllib.request.urlretrieve(RVM_URL, tmp)
        os.replace(tmp, dst)
    return dst


DEFAULT_STYLE = {
    "font": "Anton-Regular.ttf", "emphFont": "", "accent": "#fddc5b", "text": "#FFFFFF",
    "tracking": 0.0, "glow": 0.7, "contorno": 0.0,
    "desenfoque": 0.8, "zooms": True, "sonidos": True, "titulos": True,
    "densidad": 2, "posiciones": ["detras", "arriba", "centro", "abajo"],
    "animaciones": ["pop", "deslizar", "escribir"], "sonidoTitulos": "auto",
    "zoomIntensidad": 1.0, "zoomFrecuencia": "normal", "zoomEstilo": "normal", "zoomDeriva": False, "sfxZoom": "none", "sfxVol": 1.0, "sfxCierre": "ding", "sfxPorAnim": {}, "sfxTipos": {}, "sfxGanancia": {}, "zoomBN": False, "motionBlur": 0.0, "motionBlurSobre": "fondo", "motionBlurModo": "zoom", "fondoModo": "titulos", "titulosCaso": "mayus", "sombra": 1.0,
    "pelicula": {"on": False, "bloom": 0.6, "umbral": 0.72, "tamano": 0.5, "halacion": 0.5, "grano": 0.35, "desvanecido": 0.25, "calidez": 0.4, "sobreMi": True},
    "imagen": {"contraste": 1.0, "saturacion": 1.0, "brillo": 0, "vineta": 0.0, "bloom": 0.0, "degradado": 0.0},
    "subs": {"on": True, "font": "Poppins-ExtraBold.ttf", "emphFont": "", "size": "L", "y": 0.74, "maxPal": 3,
             "mayus": True, "caso": "", "conGrande": "completo", "pulso": True,"resalte": "palabra", "claves": True, "caja": False, "tracking": 0.0, "glow": 0.0, "contorno": 0.8},
}


def merge_style(s):
    """Completa un estilo guardado con los valores por defecto (los proyectos viejos siguen funcionando)."""
    import copy
    out = copy.deepcopy(DEFAULT_STYLE)
    for k, v in (s or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k].update(v)
        else:
            out[k] = v
    im, pe = out.get("imagen", {}), out["pelicula"]
    if float(im.get("bloom", 0) or 0) > 0.02 and not pe.get("on"):  # el bloom viejo pasa a la película, solo sobre las luces del fondo
        pe.update({"on": True, "bloom": float(im["bloom"]), "halacion": 0.0, "grano": 0.0, "desvanecido": 0.0, "calidez": 0.0})
    im["bloom"] = 0.0
    fonts = list_fonts()
    for path in (("font",), ("emphFont",), ("subs", "font"), ("subs", "emphFont")):
        d = out
        for key in path[:-1]:
            d = d[key]
        if d[path[-1]] and d[path[-1]] not in fonts:
            d[path[-1]] = fonts[0] if path[-1] == "font" and fonts else ""
    return out


def list_fonts():
    return sorted(p.name for p in FONTS.glob("*.ttf")) + sorted(p.name for p in FONTS.glob("*.otf"))


def asegurar_legible(proj):
    """Si OpenCV no puede leer el video (pasa con algunos de teléfono o de WhatsApp en Windows: H.265, cuadros variables),
    se convierte una vez a un H.264 normal. Sin esto todo lo demás (recorte, vista previa, exportación) falla o da duración cero."""
    import cv2
    src = Path(proj) / "source.mp4"
    cap = cv2.VideoCapture(str(src))
    bien = cap.isOpened() and cap.get(cv2.CAP_PROP_FRAME_COUNT) > 0 and cap.read()[0]
    cap.release()
    if bien and os.environ.get("ESTUDIO_FORZAR_CONVERSION") != "1":
        return False
    status(proj, "preparar", 3, "Convirtiendo el video a un formato que se pueda editar")
    tmp = Path(proj) / "_fuente.mp4"
    subprocess.run([ffmpeg_exe(), "-v", "error", "-y", "-i", str(src), "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p",
                    "-fps_mode", "cfr", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(tmp)], check=True)
    tmp.replace(src)
    return True


def _cube_plano(path, n=33):
    """LUT incluida para video grabado en perfil plano o Log: sube contraste y color. Es aproximada: una LUT de tu cámara es más exacta."""
    import numpy as np
    r = np.linspace(0, 1, n)
    b, g, rr = np.meshgrid(r, r, r, indexing="ij")  # el .cube hace variar primero el rojo
    x = np.stack([rr, g, b], -1).reshape(-1, 3)
    x = np.clip((x - 0.42) * 1.5 + 0.5, 0, 1)
    gris = x @ np.array([0.2126, 0.7152, 0.0722])
    x = np.clip(gris[:, None] + (x - gris[:, None]) * 1.3, 0, 1)
    with open(path, "w") as f:
        f.write(f"LUT_3D_SIZE {n}\n" + "\n".join(f"{a:.5f} {b_:.5f} {c:.5f}" for a, b_, c in x) + "\n")


def aplicar_lut(proj, lut):
    """Aplica una LUT (.cube) al video de origen, o la quita (lut=None). El original se guarda como source_original.mp4,
    así la vista en vivo, el recorte y el video final usan el mismo color. Se puede volver al original."""
    proj = Path(proj)
    src, orig = proj / "source.mp4", proj / "source_original.mp4"
    if lut is None:
        if orig.exists():
            orig.replace(src)
    else:
        if not orig.exists():
            src.replace(orig)
        tmp = proj / "_fuente_lut.mp4"
        shutil.copyfile(lut, proj / "_lut.cube")
        status(proj, "lut", 10, "Aplicando el color a tu video")
        subprocess.run([ffmpeg_exe(), "-v", "error", "-y", "-i", orig.name, "-vf", "lut3d=file=_lut.cube", "-c:v", "libx264", "-crf", "16", "-preset", "veryfast",
                        "-pix_fmt", "yuv420p", "-fps_mode", "passthrough", "-c:a", "copy", "-movflags", "+faststart", tmp.name], check=True, cwd=proj)
        tmp.replace(src)
        (proj / "_lut.cube").unlink(missing_ok=True)
    for f in ("preview.mp4", "final.mp4"):
        (proj / f).unlink(missing_ok=True)
    status(proj, "analizado", 100, "Color aplicado" if lut else "Color original")


def probe(video):
    """Devuelve (ancho, alto, fps, duracion) usando OpenCV."""
    import cv2
    cap = cv2.VideoCapture(str(video))
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    n = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    cap.release()
    dur = n / fps if n and n > 0 and fps else 0.0
    if not dur or dur != dur:  # algunos videos (WhatsApp, teléfonos) no traen el conteo de cuadros: la duración se lee con ffmpeg
        import re
        r = subprocess.run([ffmpeg_exe(), "-hide_banner", "-i", str(video)], capture_output=True, text=True, errors="ignore")
        m = re.search(r"Duration: (\d+):(\d+):(\d+(?:\.\d+)?)", r.stderr or "")
        if m:
            dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    return w, h, fps, dur


# ---------------------------------------------------------------- formatos de salida
# El video se edita en el formato que elijas. Si el original tiene otra proporción, se recorta (nunca se estira).
FORMATOS = {"9x16": (9, 16), "16x9": (16, 9), "1x1": (1, 1), "4x5": (4, 5)}
NOMINAL = {"9x16": (1080, 1920), "16x9": (1920, 1080), "1x1": (1080, 1080), "4x5": (1080, 1350)}


def formato_auto(w, h):
    r = w / max(h, 1)
    return "16x9" if r > 1.2 else "1x1" if r > 0.9 else "9x16"


def formato_de(plan, w=None, h=None):
    f = (plan or {}).get("formato")
    if f in FORMATOS:
        return f
    return formato_auto(w, h) if w and h else "9x16"


def encuadre_de(plan):
    e = (plan or {}).get("encuadre") or {}
    return min(max(float(e.get("x", 0.5)), 0.0), 1.0), min(max(float(e.get("y", 0.4)), 0.0), 1.0)


def cuadro_cover(w, h, f, fx=0.5, fy=0.4):
    """Recorte (x, y, ancho, alto) de un cuadro w×h con la proporción del formato, el más grande posible."""
    a, b = FORMATOS[f]
    asp = a / b
    if abs(w / h - asp) / asp < 0.02:
        return 0, 0, w, h
    if w / h > asp:
        ch, cw = h, int(round(h * asp))
    else:
        cw, ch = w, int(round(w / asp))
    return int(round(fx * (w - cw))), int(round(fy * (h - ch))), cw, ch


def par(n):
    return max(int(round(n / 2) * 2), 2)


def encuadrar(img, f, fx=0.5, fy=0.4):
    """Recorta una imagen (numpy) a la proporción del formato."""
    h, w = img.shape[:2]
    x, y, cw, ch = cuadro_cover(w, h, f, fx, fy)
    return img if (cw == w and ch == h) else img[y:y + ch, x:x + cw]
