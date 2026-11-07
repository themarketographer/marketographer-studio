"""Extras de exportación: subtítulos .srt con los cortes aplicados y versiones 4:5 y 1:1 del video final."""
import re
import subprocess
from pathlib import Path
import render as R
import cuts as cutmod
from common import load, merge_style, ffmpeg_exe, encoder_args, probe, status, NOMINAL, cuadro_cover


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
    subprocess.run([ffmpeg_exe(), "-v", "error", "-y", "-i", str(src), "-vf", f"crop={cw}:{ch}:{cx}:{cy},scale={W}:{H}:flags=lanczos", *encoder_args("final"),
                    "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", str(out)], check=True)
    status(proj, "listo", 100, out.name)
    return out


# ---------- presets de exportación (una sola pasada de ffmpeg sobre final.mp4) ----------
import json
import functools


@functools.lru_cache(maxsize=None)
def _encoders():
    return subprocess.run([ffmpeg_exe(), "-hide_banner", "-encoders"], capture_output=True, text=True).stdout


def _carga_presets():
    return json.loads(Path(__file__).with_name("presets_export.json").read_text(encoding="utf8"))["presets"]


def _valida(c):
    """Revisa un ajuste personalizado; cualquier valor raro se rechaza."""
    if c.get("codec") not in ("h264", "hevc", "prores"):
        raise RuntimeError("Ajuste no válido")
    if c.get("corto") not in (720, 1080, 1440, 2160):
        raise RuntimeError("Ajuste no válido")
    if c.get("fps") not in (None, 24, 25, 30, 60):
        raise RuntimeError("Ajuste no válido")
    if c["codec"] != "prores" and not (1 <= float(c.get("mbps", 0)) <= 80):
        raise RuntimeError("Ajuste no válido")
    c.setdefault("ext", "mov" if c["codec"] == "prores" else "mp4")
    c.setdefault("perfil", 3)
    return c


def _args_de(cfg, w, h):
    """Lista de argumentos de ffmpeg (sin entrada ni salida) y una nota opcional. Función pura, se puede probar."""
    cod, nota = cfg["codec"], ""
    f, af = [], []
    if cod in ("wav", "mp3"):
        a = ["-vn", "-c:a", "pcm_s24le", "-ar", "48000"] if cod == "wav" else ["-vn", "-c:a", "libmp3lame", "-b:a", "256k"]
    else:
        corto = cfg.get("corto")
        if corto:
            c = min(corto, min(w, h))
            if corto > min(w, h):
                nota = f"No se amplía: el video se armó en {min(w, h)}"
            f.append(f"scale='if(gt(iw,ih),-2,{c})':'if(gt(iw,ih),{c},-2)':flags=lanczos")
        if cfg.get("fps"):
            f.append(f"fps={cfg['fps']}")
        mb = cfg.get("mbps", 10)
        if cod == "gif":
            vf = ",".join([f"fps={cfg.get('fps', 15)}"] + [x for x in f if not x.startswith("fps")] + ["split[a][b];[a]palettegen[p];[b][p]paletteuse"])
            return ["-t", "15", "-vf", vf, "-an"], (nota + " " if nota else "") + "El GIF usa solo los primeros 15 s"
        if cod == "h264":
            v = ["-c:v", "h264_videotoolbox", "-b:v", f"{mb}M", "-maxrate", f"{1.5 * mb:g}M"] if "h264_videotoolbox" in _encoders() \
                else ["-c:v", "libx264", "-crf", "18", "-preset", "medium", "-maxrate", f"{1.5 * mb:g}M", "-bufsize", f"{3 * mb:g}M"]
            v += ["-pix_fmt", "yuv420p", "-movflags", "+faststart"]
        elif cod == "hevc":
            if "hevc_videotoolbox" not in _encoders():
                raise RuntimeError("Esta Mac no tiene HEVC por hardware")
            v = ["-c:v", "hevc_videotoolbox", "-b:v", f"{mb}M", "-tag:v", "hvc1", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
        else:  # prores
            v = ["-c:v", "prores_ks", "-profile:v", str(cfg.get("perfil", 3)), "-pix_fmt", "yuv422p10le"]
        a = v + (["-c:a", "pcm_s24le"] if cod == "prores" else ["-c:a", "aac", "-b:a", "320k", "-ar", "48000"])
        if f:
            a = ["-vf", ",".join(f)] + a
    if cfg.get("lufs") is not None:
        af.append(f"loudnorm=I={cfg['lufs']}:TP=-1:LRA=11")
    if af:
        a += ["-af", ",".join(af)]
    return a, nota


def medir(path):
    """Volumen del archivo: LUFS integrado y pico (dBFS)."""
    r = subprocess.run([ffmpeg_exe(), "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    i = re.findall(r"I:\s+(-?[\d.]+) LUFS", r)
    p = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", r)
    return {"lufs": float(i[-1]) if i else None, "pico": float(p[-1]) if p else None}


def preset(proj, pid, custom=None):
    proj = Path(proj)
    src = proj / "final.mp4"
    if not src.exists():
        raise RuntimeError("Primero exporta el video final.")
    if pid == "custom":
        cfg = _valida(dict(custom or {}))
    else:
        cfg = next((p for p in _carga_presets() if p["id"] == pid), None)
        if not cfg:
            raise RuntimeError("Ajuste no válido")
    w, h, _, _ = probe(src)
    args, nota = _args_de(cfg, w, h)
    nombre = re.sub(r"[^\w-]+", "-", load(proj, "meta.json", {}).get("nombre", proj.name)).strip("-") or "video"
    carpeta = proj / "export"
    carpeta.mkdir(exist_ok=True)
    out = carpeta / f"{nombre}-{pid}.{cfg['ext']}"
    status(proj, "formato", 20, f"Exportando {cfg.get('n', pid)}")
    subprocess.run([ffmpeg_exe(), "-v", "error", "-y", "-i", str(src), *args, str(out)], check=True)
    med = {}
    if cfg["ext"] in ("mp4", "mov", "wav", "mp3"):
        med = medir(out)
    mj = carpeta / "medidas.json"
    try:
        todo = json.loads(mj.read_text(encoding="utf8"))
    except Exception:
        todo = {}
    todo[out.name] = {**med, "nota": nota}
    mj.write_text(json.dumps(todo, ensure_ascii=False), encoding="utf8")
    status(proj, "listo", 100, "export/" + out.name)
    return out


def _prueba():
    redes = next(p for p in _carga_presets() if p["id"] == "redes")
    a, _ = _args_de(redes, 1080, 1920)
    assert any("scale=" in x for x in a) and any("loudnorm" in x for x in a)
    gif = next(p for p in _carga_presets() if p["id"] == "gif")
    g, _ = _args_de(gif, 1080, 1920)
    assert "-c:a" not in g and "-an" in g
    try:
        _valida({"codec": "h264", "corto": 999, "mbps": 10})
        assert False, "debía fallar"
    except RuntimeError:
        pass
    print("ok")
