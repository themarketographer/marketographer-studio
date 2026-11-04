"""Cortes de silencio al estilo de DaVinci: primero se detecta, se revisa y después se corta.

Parámetros (mismos nombres que usa Resolve en Ripple Delete Silence):
  umbral      nivel en dB por debajo del cual el audio cuenta como silencio
  minFrames   silencio mínimo para cortarlo, en frames (Minimum to Trip)
  pre         frames que se conservan antes de que vuelva el sonido (Pre Head)
  post        frames que se conservan después de que termina el sonido (Post Tail)
"""
import subprocess
import numpy as np
import re
from pathlib import Path
from common import ffmpeg_exe, load, save

HOP = 0.01  # un valor de volumen cada 10 ms


def envolvente(proj):
    """Volumen en dB cada 10 ms. Se calcula una vez y se guarda en envolvente.json."""
    proj = Path(proj)
    cache = load(proj, "envolvente.json")
    if cache:
        return cache
    raw = subprocess.run([ffmpeg_exe(), "-v", "error", "-i", str(proj / "source.mp4"), "-vn", "-ac", "1", "-ar", "8000", "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32)
    k = int(8000 * HOP)
    n = len(x) // k
    rms = np.sqrt(np.mean(x[: n * k].reshape(n, k) ** 2, axis=1))
    db = np.clip(20 * np.log10(rms + 1e-6), -90, 0)
    data = {"hop": HOP, "db": [round(float(v), 1) for v in db]}
    save(proj, "envolvente.json", data)
    return data


def detectar(db, fps, dur, umbral=-38.0, minFrames=10, pre=3, post=3, hop=HOP):
    """Devuelve los tramos [inicio, fin] en segundos que se van a quitar."""
    n = len(db)
    runs, i = [], 0
    while i < n:
        if db[i] < umbral:
            j = i
            while j < n and db[j] < umbral:
                j += 1
            runs.append((i * hop, j * hop))
            i = j
        else:
            i += 1
    out = []
    for s, e in runs:
        if e - s < minFrames / fps:
            continue
        s2 = s + post / fps if s > hop else s
        e2 = e - pre / fps if e < dur - 2 * hop else e
        if e2 - s2 > 0.04:
            out.append([round(s2, 3), round(e2, 3)])
    return out


def conservar(rangos, ini, fin, minimo=0.05):
    """Tramos que quedan (complemento de lo que se quita) dentro de [ini, fin]."""
    keep, cur = [], ini
    for s, e in sorted(rangos):
        if e <= ini or s >= fin:
            continue
        s, e = max(s, ini), min(e, fin)
        if s - cur >= minimo:
            keep.append((cur, s))
        cur = max(cur, e)
    if fin - cur >= minimo:
        keep.append((cur, fin))
    return keep or [(ini, fin)]


class Mapa:
    """Convierte tiempos del video original en tiempos del video ya cortado."""

    def __init__(self, keep):
        self.keep = [(k[0], k[1]) for k in keep]
        self.fac = [(k[2] if len(k) > 2 else 1.0) for k in keep]  # >1 = cámara lenta
        self.acum, t = [], 0.0
        for (s, e), f in zip(self.keep, self.fac):
            self.acum.append(t)
            t += (e - s) * f
        self.total = t

    def fuera(self, t):
        """Segundo en el video cortado. Si t cae en un tramo quitado, devuelve el inicio del siguiente tramo."""
        for (s, e), a, f in zip(self.keep, self.acum, self.fac):
            if t < s:
                return a
            if t < e:
                return a + (t - s) * f
        return self.total

    def vivo(self, t):
        return any(s <= t < e for s, e in self.keep)

    def ajustar(self, ini, fin):
        """Mueve un tramo [ini, fin] para que no empiece en un corte. Devuelve None si desaparece."""
        if not self.vivo(ini):
            sig = [s for s, _ in self.keep if s > ini]
            if not sig:
                return None
            ini = sig[0]
        if fin <= ini:
            return None
        return ini, fin


def con_lentos(keep, lentos, minimo=0.05):
    """Parte cada tramo que se queda en trozos normales y trozos en cámara lenta. Devuelve [(ini, fin, factor, tramo_original)]."""
    out = []
    for idx, (s, e) in enumerate(keep):
        cortes = [(max(l["start"], s), min(l["end"], e), float(l.get("factor", 2))) for l in lentos if l["end"] > s and l["start"] < e]
        cur = s
        for a, b, f in sorted(cortes):
            if b - a < minimo:
                continue
            if a - cur >= minimo:
                out.append((cur, a, 1.0, idx))
            out.append((max(a, cur), b, f, idx))
            cur = b
        if e - cur >= minimo or cur == s:
            out.append((cur, e, 1.0, idx))
    return out


def por_palabras(words, db, dur, antes=0.06, despues=0.10, fin=0.10, minimo=0.12, hop=HOP):
    """Corte guiado por la transcripción: solo se queda lo que está dentro de una palabra, con un poco de aire alrededor.
    Respiraciones, golpes y ruido de calle caen fuera de las palabras y se cortan sin importar su volumen.
    Los bordes de cada palabra se ajustan con la energía del audio, medida contra el piso y el nivel de tu propia voz,
    así una palabra dicha bajito no se recorta y un ruido fuerte entre palabras tampoco se cuela.
    Devuelve los tramos [inicio, fin] que se quitan."""
    n = len(db)
    if not words or not n:
        return []
    srt = sorted(db)
    piso, nivel = srt[int(n * 0.10)], srt[int(n * 0.90)]
    if nivel - piso < 12:
        piso = nivel - 12
    umbral = piso + 0.35 * (nivel - piso)

    def en(t):
        return db[min(n - 1, max(0, int(t / hop)))]

    keeps = []
    for i, w in enumerate(words):
        a, b = float(w["start"]), float(w["end"])
        ant = float(words[i - 1]["end"]) if i else 0.0
        sig = float(words[i + 1]["start"]) if i + 1 < len(words) else dur
        x, lim = a, max(ant, a - 0.15)
        while x - hop >= lim and en(x - hop) >= umbral:
            x -= hop
        a2 = x
        x, lim = b, min(sig, b + 0.20)
        while x + hop <= lim and en(x) >= umbral:
            x += hop
        b2 = x
        extra = fin if re.search(r"[.?!…]$", str(w["w"]).strip()) else 0.0
        keeps.append([max(0.0, a2 - antes), min(dur, b2 + despues + extra)])
    keeps.sort()
    unidos = [keeps[0]]
    for s_, e_ in keeps[1:]:
        if s_ - unidos[-1][1] < minimo:
            unidos[-1][1] = max(unidos[-1][1], e_)
        else:
            unidos.append([s_, e_])
    out, cur = [], 0.0
    for s_, e_ in unidos:
        if s_ - cur >= minimo:
            out.append([round(cur, 3), round(s_, 3)])
        cur = e_
    if dur - cur >= minimo:
        out.append([round(cur, 3), round(dur, 3)])
    return out


def unir_rangos(rangos, hueco=0.0):
    out = []
    for s_, e_ in sorted([list(r) for r in rangos]):
        if out and s_ <= out[-1][1] + hueco:
            out[-1][1] = max(out[-1][1], e_)
        else:
            out.append([s_, e_])
    return out


def rangos_plan(proj, plan, fps, dur):
    """Todos los tramos que se quitan: pausas y ruidos (si están activos) y palabras borradas a mano en la transcripción."""
    cortes = plan.get("cortes") or {}
    rangos = [list(r) for r in cortes.get("rangos", [])] if cortes.get("on") else []
    if cortes.get("on") and cortes.get("auto"):
        db = envolvente(proj)["db"]
        if cortes.get("modo") == "palabras":
            vivas = palabras_vivas(load(proj, "words.json", {"words": []})["words"], plan)
            rangos = por_palabras(vivas, db, dur, cortes.get("aireAntes", 0.06), cortes.get("aireDespues", 0.10), cortes.get("aireFin", 0.10), cortes.get("minCorte", 0.12))
        else:
            rangos = detectar(db, fps, dur, cortes.get("umbral", -38), cortes.get("minFrames", 10), cortes.get("pre", 3), cortes.get("post", 3))
        rangos = [r for r in rangos if not any(a <= (r[0] + r[1]) / 2 <= b for a, b in cortes.get("ignorar", []))]
        rangos += [list(r) for r in cortes.get("manual", [])]
    manual = [[max(0.0, float(a)), min(float(b), dur)] for a, b in (cortes.get("borradas") or []) if b > a]
    return unir_rangos(rangos + manual)


def palabras_vivas(words, plan):
    """Palabras que siguen en el video: se quitan las que caen dentro de un tramo borrado a mano."""
    br = ((plan.get("cortes") or {}).get("borradas") or [])
    if not br:
        return words
    return [w for w in words if not any(a <= (w["start"] + w["end"]) / 2 < b for a, b in br)]
