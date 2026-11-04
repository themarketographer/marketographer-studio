"""Vocabulario propio: términos que Whisper debe respetar y reemplazos fijos para errores frecuentes."""
import difflib, json, re, unicodedata
from pathlib import Path
from common import ENGINE, load, save

RUTA = ENGINE.parents[2] / "data" / "vocabulario.json"
DEFECTO = {
    "terminos": ["The Marketographers", "marketographers", "Marketographer", "Pablo Villarroel", "Estudio Graphica", "membresía", "membresías",
                 "TikTok", "Instagram", "Reels", "storytelling", "StorySelling", "branding", "Lightroom", "Photoshop"],
    "reemplazos": [{"de": "marketógrafos", "a": "marketographers"}, {"de": "marketógrafo", "a": "marketographer"},
                   {"de": "marquetógrafos", "a": "marketographers"}, {"de": "marquetógrafo", "a": "marketographer"}],
}


def cargar():
    if RUTA.exists():
        try:
            v = json.loads(RUTA.read_text(encoding="utf8"))
            return {"terminos": list(v.get("terminos", [])), "reemplazos": list(v.get("reemplazos", []))}
        except Exception:
            pass
    return json.loads(json.dumps(DEFECTO))


def guardar(v):
    RUTA.parent.mkdir(parents=True, exist_ok=True)
    RUTA.write_text(json.dumps(v, ensure_ascii=False, indent=2), encoding="utf8")


def prompt(v=None):
    v = v or cargar()
    return ", ".join(v["terminos"][:40]) + "."


def _n(s):
    s = unicodedata.normalize("NFD", s.lower())
    return re.sub(r"[^a-z0-9ñ]", "", "".join(c for c in s if unicodedata.category(c) != "Mn"))


def _forma(orig, nuevo):
    """Conserva la mayúscula inicial de la palabra original cuando el término va en minúscula."""
    if nuevo != nuevo.lower():
        return nuevo
    return nuevo[:1].upper() + nuevo[1:] if orig[:1].isupper() else nuevo


def corregir(words, v=None):
    """Devuelve (palabras corregidas, lista de cambios). Los tiempos no cambian."""
    v = v or cargar()
    reemp = [(_n(r["de"]), r["a"]) for r in v["reemplazos"] if r.get("de") and r.get("a") and " " not in r["de"].strip()]
    reemp.sort(key=lambda x: -len(x[0]))
    frases = [([_n(p) for p in r["de"].split()], r["a"]) for r in v["reemplazos"] if r.get("de") and r.get("a") and " " in r["de"].strip()]
    cambios = []
    if frases:  # frases de varias palabras ("marketo grafos") se unen en una sola
        unidas, i = [], 0
        while i < len(words):
            hit = next(((len(toks), a) for toks, a in frases if [_n(x["w"]) for x in words[i:i + len(toks)]] == toks), None)
            if hit:
                n, a = hit
                ult = words[i + n - 1]["w"]
                cola = re.search(r"[.,;:!?)»\"'…]*$", ult).group(0)
                cambios.append([" ".join(x["w"] for x in words[i:i + n]), a + cola])
                unidas.append({**words[i], "w": a + cola, "end": words[i + n - 1]["end"]})
                i += n
            else:
                unidas.append(words[i])
                i += 1
        words = unidas
    terminos = [t for t in v["terminos"] if " " not in t.strip() and len(_n(t)) >= 9]
    out = []
    for w in words:
        t = w["w"]
        m = re.match(r"^([¿¡(«\"']*)(.*?)([.,;:!?)»\"'…]*)$", t)
        pre, core, post = m.group(1), m.group(2), m.group(3)
        k = _n(core)
        nuevo = None
        for de, a in reemp:
            if k == de:
                nuevo = a
                break
        if nuevo is None and len(k) >= 7:
            mejor, r0 = None, 0.0
            for term in terminos:
                tn = _n(term)
                if k == tn:
                    mejor = None
                    break
                if abs(len(k) - len(tn)) <= 2 and k[:1] == tn[:1]:
                    r = difflib.SequenceMatcher(None, k, tn).ratio()
                    if r > r0:
                        mejor, r0 = term, r
            if mejor and r0 >= 0.86:
                nuevo = mejor
        if nuevo is not None and nuevo != core:
            nw = pre + _forma(core, nuevo) + post
            cambios.append([t, nw])
            out.append({**w, "w": nw})
        else:
            out.append(w)
    return out, cambios


def aplicar(proj):
    import shutil
    proj = Path(proj)
    data = load(proj, "words.json", {"words": []})
    nuevas, cambios = corregir(data["words"])
    if cambios:
        if not (proj / "words_orig.json").exists():
            shutil.copyfile(proj / "words.json", proj / "words_orig.json")
        save(proj, "words.json", {**data, "words": nuevas})
    return cambios
