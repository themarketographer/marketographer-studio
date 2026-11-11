"""Prueba de humo de una instalación: arranca el servidor, sube un video de prueba, lo analiza y exporta.
Uso: <python del .venv> empaquetar/probar_instalacion.py <carpeta del Estudio> [<node>]
Sirve igual en Mac y en Windows (la usa la prueba automática de GitHub). Sale con código 1 si algo falla."""
import json, os, subprocess, sys, time, urllib.request
from pathlib import Path

raiz = Path(sys.argv[1]).resolve()
node = sys.argv[2] if len(sys.argv) > 2 else "node"
sys.path.insert(0, str(raiz / "modules" / "talking-head" / "engine"))
import common
PORT = "4199"
URL = f"http://127.0.0.1:{PORT}"

def api(ruta, metodo="GET", datos=None, tipo="application/json"):
    req = urllib.request.Request(URL + "/api" + ruta, data=datos, method=metodo, headers={"Content-Type": tipo})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read() or b"{}")

def falla(msg):
    print("FALLA:", msg); sys.exit(1)

tmp = Path(os.environ.get("RUNNER_TEMP") or os.environ.get("TMPDIR") or os.environ.get("TEMP") or "/tmp") / "estudio_prueba"
tmp.mkdir(parents=True, exist_ok=True)
video = tmp / "prueba.mp4"
ff = common.ffmpeg_exe()
print("ffmpeg:", ff)
video_voz = os.environ.get("ESTUDIO_VIDEO_PRUEBA")  # un video con voz real o sintética, para medir tiempos
if video_voz:
    video = Path(video_voz)
else: subprocess.run([ff, "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=540x960:rate=30:duration=4", "-f", "lavfi", "-i", "sine=frequency=300:duration=4",
                "-pix_fmt", "yuv420p", "-c:v", "libx264", "-c:a", "aac", "-shortest", str(video)], check=True)
print("codificador elegido:", common.encoder_args("borrador"))

env = {**os.environ, "PORT": PORT}
log = open(tmp / "servidor.log", "w", encoding="utf-8")
srv = subprocess.Popen([node, "server/index.js"], cwd=raiz, env=env, stdout=log, stderr=log)
try:
    for _ in range(60):
        try: api("/modules"); break
        except Exception: time.sleep(0.5)
    else: falla("el servidor no arrancó")
    print("módulos:", [m["id"] for m in api("/modules")])
    for r in ["/guiones/referencias", "/talking-head/filtros", "/talking-head/proyectos"]:
        api(r); print("ok", r)
    nuevo = api("/talking-head/subir?nombre=prueba.mp4", "POST", video.read_bytes(), "application/octet-stream")
    pid = nuevo.get("id") or nuevo.get("proyecto", {}).get("id")
    if not pid: falla(f"subida sin id: {nuevo}")
    print("proyecto:", pid)
    api(f"/talking-head/proyectos/{pid}/analizar", "POST", b"{}")
    t_an = time.time()
    fin = time.time() + 1500
    while time.time() < fin:
        e = api(f"/talking-head/proyectos/{pid}/estado")
        if not e.get("corriendo"): break
        time.sleep(2)
    else: falla("el análisis no terminó en 10 minutos")
    st = e.get("status") or {}
    print(f"análisis: {time.time() - t_an:.0f} s", "estado final:", st)
    if st.get("error"): falla(f"el análisis dio error: {st['error']}")
    if not e.get("analizado"): falla("no se generó plan.json")
    t_e = time.time()
    envo = api(f"/talking-head/proyectos/{pid}/envolvente")  # lo que lee la herramienta de cortes
    print(f"envolvente: {time.time() - t_e:.1f} s, {len(envo.get('db', []))} muestras")
    if not envo.get("db"): falla("la envolvente salió vacía")
    pl = api(f"/talking-head/proyectos/{pid}")
    print("palabras:", len((pl.get("palabras") or [])))
    t_r = time.time()
    api(f"/talking-head/proyectos/{pid}/renderizar", "POST", json.dumps({"calidad": "borrador"}).encode())
    fin = time.time() + 1500
    while time.time() < fin:
        e = api(f"/talking-head/proyectos/{pid}/estado")
        if not e.get("corriendo"): break
        time.sleep(2)
    else: falla("la vista previa no terminó en 10 minutos")
    st = e.get("status") or {}
    print(f"vista previa: {time.time() - t_r:.0f} s", "estado final render:", st)
    if st.get("error") or not e.get("tienePreview"): falla(f"no se generó la vista previa: {st}")
    print("TODO BIEN")
finally:
    srv.terminate()
    try: srv.wait(10)
    except Exception: srv.kill()
    log.close()
