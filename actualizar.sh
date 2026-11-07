#!/bin/bash
# Baja la última versión del Estudio desde GitHub y la pone encima del código. No toca tus videos (data), ni lo ya instalado (Python, modelos).
# Después, preparar.sh (o la app) completa lo que haya cambiado en las librerías.
set -e
cd "$(dirname "$0")" || exit 1
REPO="${ESTUDIO_REPO:-themarketographer/marketographer-studio}"; RAMA="${ESTUDIO_RAMA:-main}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
echo "Bajando la última versión..."
curl -fsSL "https://github.com/$REPO/archive/refs/heads/$RAMA.tar.gz" -o "$TMP/codigo.tgz"
mkdir -p "$TMP/src" && tar -xzf "$TMP/codigo.tgz" -C "$TMP/src" --strip-components=1
[ -f "$TMP/src/server/index.js" ] || { echo "El archivo bajado no se ve bien."; exit 1; }
rsync -a --exclude data --exclude .venv --exclude .runtime --exclude node_modules --exclude models --exclude .git "$TMP/src/" ./
echo "Listo: versión $(cat VERSION)."
