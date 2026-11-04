#!/bin/bash
# Doble clic para abrir el estudio. Cierra esta ventana para apagarlo.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display dialog "Falta instalar Node.js. Descárgalo en nodejs.org (versión LTS) y vuelve a abrir este archivo." buttons {"Entendido"}'
  open "https://nodejs.org"
  exit 1
fi
(sleep 1 && open "http://localhost:4177") &
node server/index.js
