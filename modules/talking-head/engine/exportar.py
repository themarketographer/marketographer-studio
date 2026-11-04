"""Extras de exportación: subtítulos .srt con los cortes aplicados y versiones 4:5 y 1:1 del video final."""
import re
import subprocess
from pathlib import Path
import render as R
import cuts as cutmod
from common import load, merge_style, ffmpeg_exe, probe, status, NOMINAL, cuadro_cover


def _keep(proj, plan):
    _, _, fps, dur = probe(proj / "source.mp4")
    rangos = cutmod.rangos_plan(proj, plan, fps, dur)
    keep = cutmod.con_lentos(cutmod.conservar(rangos, 0.0, dur), plan.get("lentos") or [])
    return cutmod.Mapa(keep)


def _t(s):
    s = max(s, 0.0)
    ms = int(round(s * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def srt(proj):
    proj = Path(proj)
    plan = load(proj, "plan.json")
    style = merge_style(plan.get("style"))
    words = cutmod.palabras_vivas(load(proj, "words.json", {"words": []})["words"], plan)
    mapa = _keep(proj, plan)
    subs = style["subs"]
    caso = subs.get("caso") or ("mayus" if subs.get("mayus", True) else "tal")
    # En un .srt conviene el texto normal y bloques algo más largos que en pantalla.
    chunks = R.build_chunks(words, max(int(subs.get("maxPal", 3)), 6), "tal" if caso == "mayus" else caso)
    lineas, n = [], 1
    for ch in chunks:
        if not mapa.vivo(ch["words"][0]["start"]):
            continue
        a, b = mapa.fuera(ch["start"]), mapa.fuera(ch["end"])
        if b - a < 0.15:
            continue
        lineas.append(f"{n}\n{_t(a)} --> {_t(b)}\n{' '.join(w['t'] for w in ch['words'])}\n")
        n += 1
    (proj / "subtitulos.srt").write_text("\n".join(lineas), encoding="utf8")
    status(proj, "listo", 100, "subtitulos.srt")
    return n - 1


FORMATOS = NOMINAL


def _mmss(s):
    s = max(s, 0.0)
    return f"{int(s // 60):02d}:{s % 60:06.3f}"


def transcripcion(proj):
    """transcripcion.md: frases y palabras con su tiempo en el video final (cortes aplicados), pensado para Hyperframes."""
    proj = Path(proj)
    plan = load(proj, "plan.json")
    meta = load(proj, "meta.json", {})
    words = cutmod.palabras_vivas(load(proj, "words.json", {"words": []})["words"], plan)
    mapa = _keep(proj, plan)
    pal = []
    for w in words:
        if not mapa.vivo(w["start"]):
            continue
        a, b = mapa.fuera(w["start"]), mapa.fuera(w["end"])
        pal.append({"t": w["w"], "a": a, "b": max(b, a + 0.02)})
    # Una frase termina en . ? ! o en una pausa larga.
    frases, cur = [], []
    for i, w in enumerate(pal):
        cur.append(w)
        sig = pal[i + 1] if i + 1 < len(pal) else None
        if re.search(r"[.?!…][\"')\]]*$", w["t"]) or sig is None or sig["a"] - w["b"] > 0.7:
            frases.append(cur)
            cur = []
    dur = mapa.total
    ln = [f"# Transcripción: {meta.get('nombre', proj.name)}", "",
          f"- Duración del video final: {dur:.2f} s ({_mmss(dur)})",
          f"- Palabras: {len(pal)} · Frases: {len(frases)}",
          f"- Los tiempos están en segundos sobre el video ya cortado (los silencios quitados no cuentan), así que coinciden con el video exportado.",
          "", "## Frases", "", "| # | Inicio | Fin | Texto |", "|---|---|---|---|"]
    for n, f in enumerate(frases, 1):
        ln.append(f"| {n} | {f[0]['a']:.2f} | {f[-1]['b']:.2f} | {' '.join(w['t'] for w in f)} |")
    evs = [e for e in (plan.get("events") or []) if e.get("text")]
    if evs:
        ln += ["", "## Títulos grandes del video", "", "| Inicio | Fin | Texto |", "|---|---|---|"]
        for e in sorted(evs, key=lambda e: e["start"]):
            ln.append(f"| {mapa.fuera(e['start']):.2f} | {mapa.fuera(e['end']):.2f} | {e['text']} |")
    ln += ["", "## Palabra por palabra", "", "Cada línea es una frase: `[inicio]` y luego `palabra@segundo` (segundo en que se empieza a decir). Una palabra dura hasta que empieza la siguiente.", ""]
    for f in frases:
        ln.append(f"[{f[0]['a']:6.2f}] " + " ".join(f"{w['t']}@{w['a']:.2f}" for w in f) + f" (fin {f[-1]['b']:.2f})")
    (proj / "transcripcion.md").write_text("\n".join(ln), encoding="utf8")
    status(proj, "listo", 100, "transcripcion.md")
    return len(pal)


def formato(proj, f, y=0.45, x=0.5):
    """Recorta el video final a otro formato (4:5, 1:1, 9:16 o 16:9). `x` e `y` dicen qué parte se conserva (0 = arriba o izquierda, 1 = abajo o derecha)."""
    proj = Path(proj)
    src = proj / "final.mp4"
    if not src.exists():
        raise RuntimeError("Primero exporta el video final.")
    W, H = FORMATOS[f]
    w0, h0, _, _ = probe(src)
    cx, cy, cw, ch = cuadro_cover(w0, h0, f, max(0, min(1, x)), max(0, min(1, y)))
    cx, cy, cw, ch = (n // 2 * 2 for n in (cx, cy, cw, ch))
    out = proj / f"final_{f}.mp4"
    status(proj, "formato", 20, f"Preparando {f.replace('x', ':')}")
    subprocess.run([ffmpeg_exe(), "-v", "error", "-y", "-i", str(src), "-vf", f"crop={cw}:{ch}:{cx}:{cy},scale={W}:{H}:flags=lanczos", "-c:v", "libx264", "-preset", "veryfast", "-crf", "17",
                    "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", str(out)], check=True)
    status(proj, "listo", 100, out.name)
    return out
