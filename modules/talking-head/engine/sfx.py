"""Genera efectos de sonido sencillos con matemática, sin descargar nada."""
import numpy as np
SR = 44100


def click():
    t = np.arange(int(SR * 0.05)) / SR
    rng = np.random.default_rng(1)
    return (rng.standard_normal(t.size) * np.exp(-t * 140) * 0.7 + np.sin(2 * np.pi * 2200 * t) * np.exp(-t * 90) * 0.5).astype(np.float32)


def pop():
    t = np.arange(int(SR * 0.12)) / SR
    f = 700 - 4200 * t
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 28) * 0.8).astype(np.float32)


def whoosh():
    n = int(SR * 0.5)
    t = np.arange(n) / SR
    rng = np.random.default_rng(2)
    noise = rng.standard_normal(n)
    cutoff = 300 + 4700 * np.sin(np.pi * t / 0.5) ** 1.5
    a = 1 - np.exp(-2 * np.pi * cutoff / SR)
    out, y = np.empty(n), 0.0
    for i in range(n):
        y += a[i] * (noise[i] - y)
        out[i] = y
    env = np.sin(np.pi * t / 0.5) ** 2
    out = out * env
    return (out / (np.abs(out).max() + 1e-9) * 0.8).astype(np.float32)


def tick():
    t = np.arange(int(SR * 0.03)) / SR
    return (np.sin(2 * np.pi * 3400 * t) * np.exp(-t * 220) * 0.7).astype(np.float32)


def ding():
    t = np.arange(int(SR * 0.6)) / SR
    return ((np.sin(2 * np.pi * 1320 * t) + 0.4 * np.sin(2 * np.pi * 1980 * t)) * np.exp(-t * 7) * 0.55).astype(np.float32)


BIBLIOTECA = {"click": (click, 0.5), "pop": (pop, 0.45), "whoosh": (whoosh, 0.4), "tick": (tick, 0.5), "ding": (ding, 0.4)}
_cache = {}
carpeta = None  # carpeta de efectos propios (data/sfx); la fija el render


def _propio(archivo):
    """Efecto subido por la persona: se lee con ffmpeg, se recorta a 4 s y se nivela para que ninguno pegue más fuerte que otro."""
    import subprocess
    from pathlib import Path
    from common import ffmpeg_exe
    p = Path(carpeta or ".") / Path(archivo).name
    if not p.exists():
        return None
    raw = subprocess.run([ffmpeg_exe(), "-v", "error", "-t", "4", "-i", str(p), "-vn", "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True).stdout
    x = np.frombuffer(raw, np.float32).copy()
    if not len(x):
        return None
    x *= 0.8 / max(float(np.abs(x).max()), 1e-6)
    fa = min(int(SR * 0.02), len(x) // 2)
    if fa > 1:
        x[-fa:] *= np.linspace(1, 0, fa, dtype=np.float32)
    return x


def get(name):
    if isinstance(name, str) and name.startswith("u:"):
        if name not in _cache:
            _cache[name] = _propio(name[2:])
        return (_cache[name], 0.5) if _cache[name] is not None else (None, 0)
    if name not in BIBLIOTECA:
        return None, 0
    if name not in _cache:
        _cache[name] = BIBLIOTECA[name][0]()
    return _cache[name], BIBLIOTECA[name][1]
