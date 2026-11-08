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


MODELO_MLX = "mlx-community/whisper-small-mlx"


def con_gpu(audio, language):
    """Whisper en la GPU de Apple (mlx-whisper): unas 10 veces más rápido que en el procesador. Devuelve (palabras, duración)."""
    import mlx_whisper, numpy as np
    r = mlx_whisper.transcribe(audio, path_or_hf_repo=MODELO_MLX, language=language, word_timestamps=True,
                               condition_on_previous_text=False, initial_prompt=prompt_whisper())
    words = [{"w": w["word"].strip(), "start": round(w["start"], 3), "end": round(w["end"], 3)}
             for seg in r["segments"] for w in seg.get("words", []) if w["word"].strip()]
    # Sin el filtro de voz de faster-whisper, un tramo mudo puede "inventar" texto ("¡Suscríbete!"): se descarta lo que suena a nada.
    # shortcut: umbral fijo de volumen, si alguien graba muy bajito se sube la ganancia antes de transcribir.
    words = [w for w in words if np.sqrt(np.mean(np.square(audio[int(w["start"] * 16000):max(int(w["end"] * 16000), int(w["start"] * 16000) + 1)]))) > 0.0015]
    return words, len(audio) / 16000


def run(proj, model_size="small", language="es"):
    proj = Path(proj)
    status(proj, "transcribir", 2, "Preparando audio")
    # Se decodifica el audio con ffmpeg y se entrega como arreglo, sin depender de otras librerías de audio.
    raw = subprocess.run([ffmpeg_exe(), "-v", "error", "-i", str(proj / "source.mp4"), "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    import numpy as np
    audio = np.frombuffer(raw, np.float32)
    precisa = modo() == "precisa"
    if not precisa and os.environ.get("ESTUDIO_CPU") != "1":  # el modo preciso necesita búsqueda en haz, que la GPU no hace
        try:
            status(proj, "transcribir", 8, "Transcribiendo en la GPU")
            words, dur = con_gpu(audio, language)
            words, cambios = vocab.corregir(words)
            save(proj, "words.json", {"duration": dur, "language": language, "words": words})
            status(proj, "transcribir", 50, f"Listo: {len(words)} palabras")
            return
        except Exception as e:  # sin GPU de Apple o sin el modelo: se sigue con el método de siempre
            print(f"[transcribir] GPU no disponible ({type(e).__name__}: {e}); sigo en el procesador", flush=True)
    from faster_whisper import WhisperModel
    status(proj, "transcribir", 8, "Cargando Whisper (la primera vez descarga el modelo)")
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
