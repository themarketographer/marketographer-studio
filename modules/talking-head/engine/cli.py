"""Puerta de entrada del motor.
Uso:
  python cli.py analizar <carpeta>                       transcribe, recorta y propone el plan
  python cli.py plan <carpeta>                           vuelve a proponer el plan desde las palabras
  python cli.py render <carpeta> [--calidad borrador|final] [--desde s] [--hasta s]
"""
import argparse, sys, traceback
from pathlib import Path
from common import status


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("accion", choices=["analizar", "voz", "plan", "render", "onda", "portada", "luz", "vocab", "candidatos", "miniatura", "srt", "transcripcion", "formato", "pvn", "matte", "recorte-mejor", "exportar"])
    ap.add_argument("carpeta")
    ap.add_argument("--calidad", default="final", choices=["borrador", "medio", "final"])
    ap.add_argument("--desde", type=float, default=0.0)
    ap.add_argument("--hasta", type=float, default=None)
    ap.add_argument("--modelo", default="small")
    ap.add_argument("--solo", default=None, choices=["zooms", "titulos", "frases"])
    ap.add_argument("--solo-recorte", action="store_true")
    ap.add_argument("--t", type=float, default=0.0)
    ap.add_argument("--texto", default="")
    ap.add_argument("--pos", default="detras")
    ap.add_argument("--size", default="XL")
    ap.add_argument("--color", default="accent")
    ap.add_argument("--y", type=float, default=-1.0)
    ap.add_argument("--x", type=float, default=0.5)
    ap.add_argument("--salida", default="portada.png")
    ap.add_argument("--fmt", default="4x5", choices=["4x5", "1x1", "9x16", "16x9"])
    ap.add_argument("--audio", default="")
    ap.add_argument("--fondo", default="degradado")
    ap.add_argument("--c1", default="")
    ap.add_argument("--c2", default="")
    ap.add_argument("--imagen", default="")
    ap.add_argument("--preset", default="redes")
    ap.add_argument("--custom", default="")
    ap.add_argument("--hilos", type=int, default=0, help="0 = automático, 1 = un solo proceso")
    ap.add_argument("--tramo", default="", help="uso interno: k0:k1, fotogramas que dibuja este proceso")
    a = ap.parse_args()
    proj = Path(a.carpeta).resolve()
    try:
        if a.accion in ("analizar", "voz"):
            if a.accion == "voz":
                import voz
                voz.run(proj, a.audio, a.fondo, a.c1, a.c2, a.imagen)
            import transcribe, matte, plan
            import common
            common.asegurar_legible(proj)
            if not (proj / "words.json").exists():
                transcribe.run(proj, a.modelo)
            if not (proj / "alpha.mp4").exists():
                matte.run(proj)
            plan.run(proj)
            import cuts
            cuts.envolvente(proj)  # lista desde el principio: la herramienta de cortes no tiene que esperar a otro proceso
            import render
            render.ensure_proxy(proj)
            status(proj, "analizado", 100, "Listo para editar")
        elif a.accion == "recorte-mejor":
            import matte
            matte.mejorar(proj)
        elif a.accion == "matte":  # uso interno: un tramo del recorte, lanzado por matte.run en paralelo
            import matte
            matte.run(proj, tramo=tuple(int(n) if n else None for n in a.tramo.split(":")), salida=a.salida)
        elif a.accion == "portada":
            import portada
            portada.run(proj, a.t, a.texto, a.pos, a.size, a.color, a.y if a.y >= 0 else None, a.salida)
        elif a.accion == "candidatos":
            import portada, json
            print(json.dumps(portada.candidatos(proj), ensure_ascii=False))
        elif a.accion == "miniatura":
            import portada
            portada.miniatura(proj)
        elif a.accion == "vocab":
            import vocab, json
            print(json.dumps(vocab.aplicar(proj), ensure_ascii=False))
        elif a.accion == "luz":
            import luz
            luz.run(proj)
        elif a.accion == "onda":
            import cuts
            cuts.envolvente(proj)
        elif a.accion == "pvn":
            import provsnoob
            provsnoob.run(proj)
        elif a.accion == "srt":
            import exportar
            exportar.srt(proj)
        elif a.accion == "transcripcion":
            import exportar
            exportar.transcripcion(proj)
        elif a.accion == "formato":
            import exportar
            exportar.formato(proj, a.fmt, a.y if a.y >= 0 else 0.45, a.x)
        elif a.accion == "exportar":
            import exportar, json
            exportar.preset(proj, a.preset, json.loads(a.custom) if a.custom else None)
        elif a.accion == "plan":
            import plan
            plan.run(proj, a.solo)
        else:
            import render
            tramo = tuple(int(n) for n in a.tramo.split(":")) if a.tramo else None
            render.run(proj, a.calidad, a.desde, a.hasta, tramo=tramo, salida=a.salida if tramo else None, hilos=a.hilos or None)
    except Exception as e:
        traceback.print_exc()
        # ffmpeg que no puede leer el archivo: el texto técnico queda en el log, el usuario ve algo entendible
        txt = "No pude leer este archivo. Revisa que sea un video válido (MP4 o MOV) y que no esté dañado." if "ffmpeg" in str(e).lower() and "non-zero exit" in str(e) else str(e)
        status(proj, "error", 0, txt, error=txt)
        sys.exit(1)


if __name__ == "__main__":
    main()
