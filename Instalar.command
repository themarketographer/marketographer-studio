#!/bin/bash
# Instala el motor de video del Estudio Marketographer (una sola vez).
cd "$(dirname "$0")" || exit 1
clear
echo "Instalando el motor de video. Tarda unos minutos y solo se hace una vez."
echo

if ! command -v python3 >/dev/null 2>&1; then
  osascript -e 'display dialog "Falta Python 3. Se abrirá la página de descarga. Instálalo y vuelve a hacer doble clic en Instalar.command." buttons {"Abrir descarga"} default button 1' >/dev/null 2>&1
  open "https://www.python.org/downloads/macos/"
  exit 1
fi

echo "1/3 Creando entorno privado..."
python3 -m venv .venv || { echo "No pude crear el entorno."; read -n 1 -s -r -p "Pulsa una tecla para cerrar"; exit 1; }
./.venv/bin/python -m pip install --quiet --upgrade pip

echo "2/3 Instalando librerías (voz, recorte de fondo, video)..."
./.venv/bin/python -m pip install -r modules/talking-head/engine/requirements.txt || { echo "Falló la instalación de librerías."; read -n 1 -s -r -p "Pulsa una tecla para cerrar"; exit 1; }

echo "3/3 Descargando modelos (recorte de fondo y reconocimiento de voz)..."
./.venv/bin/python - <<'PY'
import sys
sys.path.insert(0, "modules/talking-head/engine")
import common
common.ensure_model()
from faster_whisper import WhisperModel
WhisperModel("small", device="cpu", compute_type="int8")
print("Modelos listos.")
PY
[ $? -eq 0 ] || { echo "Falló la descarga de modelos. Revisa tu internet y repite."; read -n 1 -s -r -p "Pulsa una tecla para cerrar"; exit 1; }

echo
echo "Todo instalado. Ya puedes abrir Iniciar.command."
read -n 1 -s -r -p "Pulsa una tecla para cerrar"
