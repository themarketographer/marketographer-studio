"""Convierte las palabras en un plan de edición: textos, zooms y sonidos. Todo es editable desde la interfaz."""
import re
from pathlib import Path
import cv2, numpy as np
from common import load, save, probe, status, merge_style

STOP = set("""a al algo algun alguna algunas alguno algunos ante antes asi aun aunque bien cada casi como con contra cual cuando cuanto de del desde donde dos el ella ellas ellos en entre era eres es esa ese eso esos esta estas este esto estos fue ha han hasta hay la las le les lo los mas me mi mis mucho muy nada ni no nos nosotros o os otra otro para pero poco por porque que quien se ser si sin sobre su sus tambien te tengo tiene todo todos tu tus un una uno unos y ya yo""".split())
SFX_POR_ANIM = {"pop": "click", "deslizar": "whoosh", "escribir": "none", "fade": "none", "bajar": "whoosh", "crecer": "pop", "rebote": "click", "tiembla": "click", "elastico": "pop", "ruleta": "tick"}
ZOOM_NIVELES = [1.08, 1.0, 1.12, 1.0]
ZOOM_GAP = {"poco": 2.6, "normal": 1.6, "mucho": 0.9}
DENSIDAD = {1: (8, 1.6), 2: (5, 0.6), 3: (4, 0.15)}  # (puntaje mínimo, separación entre textos)


def limpia(w):
    return re.sub(r"[^\wáéíóúüñÁÉÍÓÚÜÑ%$]", "", w)


def norm(w):
    return limpia(w).lower().translate(str.maketrans("áéíóú", "aeiou"))


# Palabras de tu mundo: suben de prioridad al elegir qué se muestra en grande.
CLAVES = set("marketing ventas vender venderse negocio negocios cliente clientes dinero ingresos curso cursos fotografia fotografo fotografos informacion resultados marca contenido redes precio cobrar comunidad estrategia audiencia seguidores talento pasion".split())
VERBAL = ("aba", "aron", "ieron", "ando", "iendo", "ara", "ase", "emos", "amos", "ian", "ia", "an", "en", "ar", "er", "ir")


def puntaje(w):
    n = norm(w)
    if not n or n in STOP:
        return 0
    s = len(n)
    if n in CLAVES:
        s += 5
    elif n.endswith(VERBAL) or w.endswith(("ó", "é")):
        s -= 3
    if n.endswith("mente"):
        s -= 3
    if any(c.isdigit() for c in n):
        s += 6
    if w[:1].isupper():
        s += 1
    return s


def frases(words, pausa=0.35, max_pal=7):
    out, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        sig = words[i + 1]["start"] - w["end"] if i + 1 < len(words) else 99
        if sig >= pausa or re.search(r"[.?!¿¡]$", w["w"]) or len(cur) >= max_pal:
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


def combos_cfg():
    import json
    return json.loads((Path(__file__).parent / "combos.json").read_text(encoding="utf8"))


def proponer_frases(words, vz, previas=None):
    """Voz en off: el texto se arma frase por frase al ritmo de la voz, con una animación distinta por frase."""
    cfg = combos_cfg()
    por_id = {c["id"]: c for c in cfg["combos"]}
    ids = [i for i in (vz.get("combos") or cfg["mezcla"]) if i in por_id] or cfg["mezcla"]
    unico = vz.get("secuencia") == "unico"
    grupos = frases(words, 0.3, 6)
    out = []
    for gi, g in enumerate(grupos):
        toks = [w["w"] for w in g]
        mejor = max(range(len(g)), key=lambda i: puntaje(g[i]["w"]))
        if puntaje(g[mejor]["w"]) >= 6:
            toks[mejor] = "*" + limpia(toks[mejor]) + "*" + ("" if limpia(toks[mejor]) == toks[mejor] else toks[mejor][len(limpia(toks[mejor])):])
        if vz.get("emojis", True):
            for i, w in enumerate(g):
                e = cfg["emojis"].get(norm(w["w"])) or cfg["emojis"].get(limpia(w["w"]).lower())
                if e and not any(ch in toks[i] for ch in e):
                    toks[i] = toks[i].rstrip(",.;:") + e
                    break  # uno por frase: más se vuelve ruido
        c = por_id[ids[0] if unico else ids[gi % len(ids)]]
        tam = vz.get("tam") or c["size"]
        ini = max(g[0]["start"] - 0.05, 0.0)
        sig = grupos[gi + 1][0]["start"] if gi + 1 < len(grupos) else None
        fin = g[-1]["end"] + 0.3
        pegada = sig is not None and sig - g[-1]["end"] < 0.3
        if sig is not None:
            fin = min(fin, sig - 0.02)
        ant = previas[gi] if previas and gi < len(previas) else None
        if ant:  # al corregir el texto se conservan la animación, el tamaño y la salida que ya elegiste para esa frase
            c = por_id.get(ant.get("combo"), c)
        out.append({"id": f"f{gi}", "kind": "frase", "text": " ".join(toks), "times": [round(w["start"], 2) for w in g], "start": round(ini, 2), "end": round(max(fin, g[-1]["end"] + 0.05), 2),
                    "pos": "centro", "combo": c["id"], "anim": c["anim"], "salida": "corte" if pegada else (vz.get("salida") or c["salida"]), "layout": c["layout"], "size": tam, "marcador": c["marcador"], "sfx": "none"})
        if ant:
            for k in ("anim", "layout", "size", "marcador", "sfx", "pos", "y", "color", "sticker"):
                if k in ant:
                    out[-1][k] = ant[k]
            if not pegada and ant.get("salida"):
                out[-1]["salida"] = ant["salida"]
    return out


def tam(texto):
    n = max(len(p) for p in texto.replace("*", "").split())
    return "XL" if n <= 6 else "L" if n <= 10 else "M"


def silueta(proj, ancho=135, alto=240, muestras=12):
    """Promedio de tu silueta a lo largo del video. Sirve para saber qué parte del texto tapa tu cabeza."""
    cap = cv2.VideoCapture(str(Path(proj) / "alpha.mp4"))
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if n <= 0:
        return None
    acc, k = np.zeros((alto, ancho), np.float32), 0
    for idx in np.linspace(0, n - 1, muestras).astype(int):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
        ok, f = cap.read()
        if ok:
            acc += cv2.resize(f[:, :, 0], (ancho, alto), interpolation=cv2.INTER_AREA) / 255.0
            k += 1
    cap.release()
    return acc / k if k else None


def y_detras(texto, mascara, style):
    """Busca tamaño y altura donde el texto detrás de ti se lea al menos al 92%. Devuelve (y, tamaño) o None."""
    import render
    if mascara is None:
        return 0.28, "XL"
    W, H = 270, 480
    m = (cv2.resize(mascara, (W, H), interpolation=cv2.INTER_LINEAR) > 0.2).astype(np.float32)
    colores = {"accent": render.hex_rgb(style["accent"]), "text": render.hex_rgb(style["text"])}
    for size in ("XL", "L", "M"):
        spr = render.title_sprite({"text": texto, "size": size, "color": "text"}, style, W, H, colores)[1]
        sh, sw = spr.shape
        buenas = []
        for y in np.arange(0.15, 0.42, 0.02):
            x0, y0 = int(W / 2 - sw / 2), int(H * y - sh / 2)
            X0, Y0, X1, Y1 = max(x0, 0), max(y0, 0), min(x0 + sw, W), min(y0 + sh, H)
            if X1 <= X0 or Y1 <= Y0:
                continue
            a = spr[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0] > 128
            if a.any() and 1 - float((m[Y0:Y1, X0:X1] * a).sum() / a.sum()) >= 0.88:
                buenas.append(float(round(y, 2)))
        if buenas:
            return max(buenas), size
    return None


def proponer_titulos(words, style, mascara):
    minimo, sep = DENSIDAD.get(int(style["densidad"]), DENSIDAD[2])
    permitidas = [p for p in style["posiciones"] if p in ("detras", "arriba", "centro", "abajo")] or ["arriba"]
    anims = [a for a in style["animaciones"] if a in SFX_POR_ANIM] or ["pop"]
    eventos, ultimo_fin, k = [], -9, 0
    for fr in frases(words):
        ini = fr[0]["start"]
        if ini < ultimo_fin + sep:
            continue
        mejor = max(fr, key=lambda w: puntaje(w["w"]))
        if puntaje(mejor["w"]) < minimo:
            continue
        texto = limpia(mejor["w"]).upper()
        idx = fr.index(mejor)
        fin_pal = mejor["end"]
        dos = False
        if idx + 1 < len(fr) and puntaje(fr[idx + 1]["w"]) >= 4 and len(texto) + len(limpia(fr[idx + 1]["w"])) <= 14:
            texto += " " + limpia(fr[idx + 1]["w"]).upper()
            fin_pal = fr[idx + 1]["end"]
            dos = True
        # Elige posición rotando entre las permitidas. Detrás de la cabeza solo entran palabras cortas que se lean.
        pos, y, size_det = None, None, "XL"
        for j in range(len(permitidas)):
            p = permitidas[(k + j) % len(permitidas)]
            if p == "detras":
                if " " in texto or len(texto) > 9:
                    continue
                r = y_detras(texto, mascara, style)
                if r is None:
                    continue
                pos, y, size_det = p, r[0], r[1]
                break
            pos = p
            break
        if pos is None:
            pos = "arriba"
        if pos == "detras":
            size = size_det
        elif pos in ("centro", "abajo"):
            size = "L" if tam(texto) == "XL" else tam(texto)
        else:
            size = tam(texto)
        if dos:  # marca la palabra de más peso para que pueda llevar otra tipografía
            partes = texto.split()
            i = max(range(2), key=lambda q: puntaje(partes[q]))
            partes[i] = f"*{partes[i]}*"
            texto = " ".join(partes)
        start = max(0.0, mejor["start"] - 0.05)
        end = min(max(fin_pal + 0.55, start + 1.0), fr[-1]["end"] + 1.2)
        anim = anims[k % len(anims)]
        sonido = (style.get("sfxPorAnim") or {}).get(anim, SFX_POR_ANIM[anim]) if style["sonidoTitulos"] == "auto" else style["sonidoTitulos"]
        ev = {"id": f"e{k+1}", "start": round(start, 2), "end": round(end, 2), "text": texto, "pos": pos, "size": size,
              "anim": anim, "color": "accent" if k % 2 == 0 else "text", "sfx": sonido}
        if y is not None:
            ev["y"] = y
        eventos.append(ev)
        ultimo_fin = end
        k += 1
    return eventos


def proponer_zooms(words, style):
    """Zoom de énfasis tras un silencio de 0.3 s o más, o al empezar una frase nueva."""
    gap = ZOOM_GAP.get(style["zoomFrecuencia"], 1.6)
    candidatos = []
    for a, b in zip(words, words[1:]):
        if b["start"] - a["end"] >= 0.3 or re.search(r"[.?!,]$", a["w"]):
            candidatos.append(b["start"])
    zooms, zl, last_t = [], 0, -9
    for t in candidatos:
        if t - last_t >= gap:
            zooms.append({"t": round(t, 2), "level": ZOOM_NIVELES[zl % 4]})
            zl += 1
            last_t = t
    return zooms


def run(proj, solo=None):
    proj = Path(proj)
    words = load(proj, "words.json")["words"]
    _, _, fps, dur = probe(proj / "source.mp4")
    prev = load(proj, "plan.json", {})
    style = merge_style(prev.get("style"))
    eventos = prev.get("events", [])
    zooms = prev.get("zooms", [])
    meta = load(proj, "meta.json", {})
    voz = meta.get("tipo") == "voz"
    tpl = meta.get("plantilla") if (voz and not prev) else None  # primera vez de un video hecho con plantilla
    if tpl:
        prev = {k: tpl[k] for k in ("voz", "audio") if tpl.get(k)}
        style = merge_style(None)
    if solo == "frases" and voz:
        previas = sorted([e for e in eventos if e.get("kind") == "frase"], key=lambda e: e["start"])
        especiales = [e for e in eventos if e.get("kind") and e.get("kind") != "frase"]
        eventos = proponer_frases(words, prev.get("voz") or {}, previas) + especiales
    elif solo != "zooms":
        mascara = silueta(proj) if (proj / "alpha.mp4").exists() else None
        especiales = [e for e in eventos if e.get("kind") and e.get("kind") != "frase"]  # listas, conexiones, gráficos y puntos que hizo la persona se conservan
        if voz:
            eventos = proponer_frases(words, prev.get("voz") or {}) + especiales
        else:
            eventos = proponer_titulos(words, style, mascara) + especiales
    if solo not in ("titulos", "frases"):
        zooms = proponer_zooms(words, style)
    claro = meta.get("fondo") in ("blanco", "cuadricula")
    if voz:  # voz en off: sin persona no hay fondo que desenfocar ni zooms que lucir, y las frases reemplazan a los subtítulos
        if not prev.get("style"):
            style["desenfoque"] = 0.0
            style["subs"]["on"] = False
            style["glow"], style["contorno"] = 0.0, 0.0
            if claro:
                style["sombra"] = 0.0
            style["text"], style["accent"] = ("#111111", "#2f6bff") if claro else ("#ffffff", "#ffd23f")
        zooms = []
        if tpl and tpl.get("style"):  # la plantilla manda sobre los valores por defecto de la voz en off
            for k, v in tpl["style"].items():
                style[k] = {**style[k], **v} if isinstance(v, dict) and isinstance(style.get(k), dict) else v
    save(proj, "plan.json", {**prev, "version": 2, "duration": round(dur, 2), "fps": fps, "style": style, "events": eventos, "zooms": zooms, **({"voz": prev.get("voz") or {"secuencia": "mezcla", "combos": combos_cfg()["mezcla"], "emojis": True}} if voz else {})})
    status(proj, "plan", 100, f"{len(eventos)} textos y {len(zooms)} zooms propuestos")
