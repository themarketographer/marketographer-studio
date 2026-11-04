"""Transcribe el audio con Whisper y guarda cada palabra con su segundo exacto."""
import json, subprocess, tempfile, os
from pathlib import Path
from common import ENGINE, ffmpeg_exe, save, status
import vocab

RUTA_AJ = ENGINE.parents[2] / "data" / "transcripcion.json"
# Texto de muestra: le enseña a Whisper a puntuar como se habla (comas, preguntas, pausas) y a escribir las muletillas.
MUESTRA = "Hola, bueno... eh, o sea, vamos a ver. ¿Sabes qué? Tiene que ser así, ¿no? Entonces, mm, empezamos."


def modo():
    """'rapida' (por defecto, búsqueda voraz) o 'precisa' (beam 5, más lenta). Se elige en Ajustes."""
    try:
        return json.loads(RUTA_AJ.read_text(encoding="utf8")).get("modo", "rapida")
    except Exception:
        return "rapida"


def prompt_whisper():
    terminos = ", ".join(vocab.cargar()["terminos"][:25])
    return f"{MUESTRA} {terminos}." if terminos else MUESTRA


def run(proj, model_size="small", language="es"):
    proj = Path(proj)
    status(proj, "transcribir", 2, "Preparando audio")
    # Se decodifica el audio con ffmpeg y se entrega como arreglo, sin depender de otras librerías de audio.
    raw = subprocess.run([ffmpeg_exe(), "-v", "error", "-i", str(proj / "source.mp4"), "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    import numpy as np
    audio = np.frombuffer(raw, np.float32)
    from faster_whisper import WhisperModel
    status(proj, "transcribir", 8, "Cargando Whisper (la primera vez descarga el modelo)")
    precisa = modo() == "precisa"
    model = WhisperModel(model_size, device="cpu", compute_type="int8", cpu_threads=os.cpu_count() or 4)
    segments, info = model.transcribe(audio, language=language, word_timestamps=True, vad_filter=True,
                                       beam_size=5 if precisa else 1, condition_on_previous_text=False,
                                       initial_prompt=prompt_whisper())
    words, total = [], max(info.duration, 1)
    for seg in segments:
        for w in seg.words or []:
            words.append({"w": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)})
        status(proj, "transcribir", 8 + 40 * min(seg.end / total, 1), f"{len(words)} palabras")
    words, cambios = vocab.corregir(words)
    save(proj, "words.json", {"duration": info.duration, "language": info.language, "words": words})
    status(proj, "transcribir", 50, f"Listo: {len(words)} palabras")
