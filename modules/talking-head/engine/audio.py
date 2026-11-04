"""Audio: mejora de la voz y música de fondo que baja sola cuando hablas."""
import math, subprocess
from pathlib import Path
import numpy as np
from common import ffmpeg_exe
import sfx

SR = sfx.SR
DEFAULT_AUDIO = {
    "mejorar": False, "graves": True, "ruido": 0.5, "compresion": True, "volumen": True,
    "musica": {"archivo": "", "vol": -18, "duck": 10, "inicio": 0, "fundido": 1.5},
}


def merge_audio(a):
    import copy
    out = copy.deepcopy(DEFAULT_AUDIO)
    for k, v in (a or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k].update(v)
        else:
            out[k] = v
    return out


def _ajusta(y, n):
    if len(y) < n:
        y = np.vstack([y, np.zeros((n - len(y), 2), np.float32)])
    return y[:n]


def mejorar(x, cfg):
    """Quita graves molestos y ruido de fondo, parejiza el volumen y lo deja en -16 LUFS."""
    f = []
    if cfg["graves"]:
        f.append("highpass=f=80")
    if cfg["ruido"] > 0.02:
        f.append(f"afftdn=nr={int(8 + cfg['ruido'] * 24)}:nf=-30")
    if cfg["compresion"]:
        f.append("acompressor=threshold=-20dB:ratio=3:attack=8:release=120:makeup=2")
    if cfg["volumen"]:
        f.append("loudnorm=I=-16:TP=-1.5:LRA=11")
    if not f or not len(x):
        return x
    f.append(f"aresample={SR}")
    r = subprocess.run([ffmpeg_exe(), "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "-af", ",".join(f),
                        "-f", "f32le", "-ar", str(SR), "-ac", "2", "-"], input=x.tobytes(), capture_output=True, check=True)
    return _ajusta(np.frombuffer(r.stdout, np.float32).reshape(-1, 2).copy(), len(x))


def _cargar(path):
    raw = subprocess.run([ffmpeg_exe(), "-v", "error", "-i", str(path), "-vn", "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()


def _rms(x):
    return float(np.sqrt(np.mean(x ** 2) + 1e-12))


def mezclar_musica(voz, cfg, carpeta):
    """Suma la música a la voz. La música baja 'duck' dB mientras hablas y sube en las pausas."""
    m = cfg["musica"]
    if not m["archivo"] or not len(voz):
        return voz
    path = Path(carpeta) / Path(m["archivo"]).name
    if not path.exists():
        return voz
    mus = _cargar(path)
    ini = int(float(m["inicio"]) * SR)
    mus = mus[ini:] if ini < len(mus) else mus
    n = len(voz)
    if len(mus) < n:
        mus = np.tile(mus, (math.ceil(n / max(len(mus), 1)), 1))
    mus = mus[:n].copy()
    # El volumen se mide contra tu voz: 0 dB deja la música igual de fuerte que la voz.
    win = int(SR * 0.05)
    k = n // win
    e = np.sqrt(np.mean(voz[: k * win].reshape(k, win, 2) ** 2, axis=(1, 2)))
    activo = e > 10 ** (-45 / 20)
    ref = _rms(voz[: k * win].reshape(k, win, 2)[activo]) if activo.any() else _rms(voz)
    mus *= (ref / _rms(mus)) * 10 ** (float(m["vol"]) / 20)
    d = np.zeros(k, np.float32)
    rel = math.exp(-0.05 / 0.45)
    for i in range(k):
        d[i] = 1.0 if activo[i] else (d[i - 1] * rel if i else 0.0)
    d = np.convolve(d, np.ones(3, np.float32) / 3, mode="same")
    gain_db = -float(m["duck"]) * d
    g = np.interp(np.arange(n), (np.arange(k) + 0.5) * win, 10 ** (gain_db / 20)).astype(np.float32)
    fa = int(SR * float(m["fundido"]))
    if fa > 1:
        g[:fa] *= np.linspace(0, 1, min(fa, n), dtype=np.float32)[:fa]
        g[-fa:] *= np.linspace(1, 0, min(fa, n), dtype=np.float32)[-fa:]
    return voz + mus * g[:, None]


def estirar(seg, sr, factor, grave=False):
    """Alarga un trozo de audio 'factor' veces. Con grave=True la voz además baja de tono (cámara lenta dramática)."""
    import subprocess
    from common import ffmpeg_exe
    paso = 0.84 if grave else 1.0
    t = 1.0 / (factor * paso)
    cadena = []
    while t < 0.5:
        cadena.append("atempo=0.5"); t /= 0.5
    cadena.append(f"atempo={t:.4f}")
    filtro = (f"asetrate={int(sr * paso)},aresample={sr}," if grave else "") + ",".join(cadena) + (",lowpass=f=4500,volume=0.8" if grave else "")
    r = subprocess.run([ffmpeg_exe(), "-v", "error", "-f", "f32le", "-ar", str(sr), "-ac", "2", "-i", "-", "-af", filtro, "-f", "f32le", "-ar", str(sr), "-ac", "2", "-"],
                       input=seg.astype("float32").tobytes(), capture_output=True, check=True).stdout
    out = np.frombuffer(r, np.float32).reshape(-1, 2).copy()
    n = int(len(seg) * factor)
    return out[:n] if len(out) >= n else np.concatenate([out, np.zeros((n - len(out), 2), np.float32)])
