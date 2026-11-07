#!/bin/bash
# Prepara todo lo que el Estudio necesita para correr en esta Mac, sin Homebrew ni nada instalado de antes:
#   Node (para el servidor), uv + Python 3.12 (motor de video), las librerías y los modelos (recorte de fondo y voz).
# Se puede volver a correr cuando quieras: salta lo que ya está listo. Todo queda dentro de la carpeta del Estudio.
# Variables para pruebas: ESTUDIO_SALTAR_MODELOS=1 (no baja Whisper ni el recorte).
set -e
cd "$(dirname "$0")" || exit 1
RT=".runtime"; mkdir -p "$RT"
ARQ="$(uname -m)"; [ "$ARQ" = "arm64" ] && NODEARQ="arm64" && UVARQ="aarch64" || { NODEARQ="x64"; UVARQ="x86_64"; }
REQ="modules/talking-head/engine/requirements.txt"
HUELLA="$(shasum -a 256 "$REQ" | cut -c1-16)"

titulo() { printf '\033]0;Preparando el Estudio\007'; }
paso() { printf '\n\033[1m%s\033[0m\n' "$1"; }
falla() { echo; echo "⚠️  $1"; echo "$1" > "$RT/error"; exit 1; }
titulo; rm -f "$RT/error"

verifica() {  # verifica <archivo> <sha256 esperado>
  [ "$(shasum -a 256 "$1" | cut -d' ' -f1)" = "$2" ] || { rm -f "$1"; falla "El archivo bajado no coincide con su firma ($1). Revisa tu internet y vuelve a intentar."; }
}

paso "1/5 Servidor (Node)"
if [ -x "$RT/node/bin/node" ]; then echo "Listo."
elif command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ]; then echo "Ya hay Node en esta Mac."
else
  V="$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | grep "darwin-$NODEARQ.tar.gz" | head -1)" || falla "No pude consultar nodejs.org. Revisa tu internet."
  [ -n "$V" ] || falla "No encontré Node para esta Mac."
  ARCH="${V##* }"; SUMA="${V%% *}"
  echo "Bajando $ARCH ..."
  curl -fL --progress-bar -o "$RT/node.tar.gz" "https://nodejs.org/dist/latest-v22.x/$ARCH" || falla "No pude bajar Node."
  verifica "$RT/node.tar.gz" "$SUMA"
  rm -rf "$RT/node"; mkdir -p "$RT/node"; tar -xzf "$RT/node.tar.gz" -C "$RT/node" --strip-components=1; rm -f "$RT/node.tar.gz"
fi

paso "2/5 Instalador de Python (uv)"
if [ -x "$RT/uv" ]; then echo "Listo."
else
  U="uv-$UVARQ-apple-darwin.tar.gz"; BASE="https://github.com/astral-sh/uv/releases/latest/download"
  curl -fL --progress-bar -o "$RT/$U" "$BASE/$U" || falla "No pude bajar uv."
  SUMA="$(curl -fsSL "$BASE/$U.sha256" | cut -d' ' -f1)" || SUMA=""
  [ -n "$SUMA" ] && verifica "$RT/$U" "$SUMA"
  tar -xzf "$RT/$U" -C "$RT" --strip-components=1 "uv-$UVARQ-apple-darwin/uv"; rm -f "$RT/$U"; chmod +x "$RT/uv"
fi
UV="$PWD/$RT/uv"
export UV_PYTHON_INSTALL_DIR="$PWD/$RT/python" UV_CACHE_DIR="$PWD/$RT/cache"

paso "3/5 Python 3.12 y librerías de video, voz y recorte (la primera vez tarda unos minutos)"
if [ ! -x .venv/bin/python ] || ! .venv/bin/python -c "import sys; assert sys.version_info[:2] == (3, 12)" 2>/dev/null; then
  rm -rf .venv
  "$UV" venv --python 3.12 .venv || falla "No pude preparar Python."
fi
if [ "$(cat "$RT/requisitos" 2>/dev/null)" != "$HUELLA" ]; then
  "$UV" pip install --python .venv/bin/python -r "$REQ" || falla "Falló la instalación de las librerías."
  echo "$HUELLA" > "$RT/requisitos"
else echo "Listo."; fi

paso "4/5 Modelos (recorte de fondo y reconocimiento de voz)"
if [ -n "$ESTUDIO_SALTAR_MODELOS" ]; then echo "Omitido."
elif [ -f "$RT/modelos" ]; then echo "Listo."
else
  ./.venv/bin/python - <<'PY' || falla "No pude bajar los modelos. Revisa tu internet y vuelve a abrir el Estudio."
import sys
sys.path.insert(0, "modules/talking-head/engine")
import common
common.ensure_model()
from faster_whisper import WhisperModel
WhisperModel("small", device="cpu", compute_type="int8")
print("Modelos listos.")
PY
  touch "$RT/modelos"
fi

rm -rf "$RT/cache"  # la caché de instalación ya no hace falta (ahorra unos 300 MB)
paso "5/5 Revisión final"
./.venv/bin/python -c "import cv2, numpy, onnxruntime, faster_whisper, PIL; print('Motor de video: ok')" || falla "El motor no arrancó."
[ -d data ] || mkdir -p data
cat VERSION > "$RT/listo" 2>/dev/null || echo ok > "$RT/listo"
echo; echo "✅ Todo listo."
