#!/bin/bash
# Doble clic para abrir el estudio. Cierra esta ventana para apagarlo.
cd "$(dirname "$0")"
NODE="node"; [ -x ".runtime/node/bin/node" ] && NODE=".runtime/node/bin/node"
if ! command -v "$NODE" >/dev/null 2>&1 && [ "$NODE" = "node" ]; then
  osascript -e 'display dialog "Falta preparar el Estudio. Haz doble clic en Instalar.command y vuelve a abrir este archivo." buttons {"Entendido"}'
  exit 1
fi
(sleep 1 && open "http://localhost:4177") &
"$NODE" server/index.js
