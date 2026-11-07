#!/bin/bash
# Instala (o actualiza) el Estudio Marketographer en esta Mac. No hace falta tener Homebrew, Node ni Python: todo se baja solo.
#   curl -fsSL https://raw.githubusercontent.com/themarketographer/marketographer-studio/main/instalar.sh | bash
# Se puede volver a correr cuando quieras: actualiza el código sin tocar tus videos.
# Variables opcionales: ESTUDIO_DIR (dónde vive, por defecto ~/EstudioMarketographer), ESTUDIO_REPO, ESTUDIO_RAMA,
# ESTUDIO_SIN_APP=1 (no crea la app en Aplicaciones), ESTUDIO_SALTAR_MODELOS=1 (para pruebas).
set -e
REPO="${ESTUDIO_REPO:-themarketographer/marketographer-studio}"; RAMA="${ESTUDIO_RAMA:-main}"
DEST="${ESTUDIO_DIR:-$HOME/EstudioMarketographer}"
[ "$(uname)" = "Darwin" ] || { echo "Por ahora el instalador es solo para Mac."; exit 1; }
mkdir -p "$DEST"; cd "$DEST"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
printf '\n\033[1mBajando el código (%s)\033[0m\n' "$RAMA"
curl -fsSL "https://github.com/$REPO/archive/refs/heads/$RAMA.tar.gz" -o "$TMP/codigo.tgz"
mkdir -p "$TMP/src" && tar -xzf "$TMP/codigo.tgz" -C "$TMP/src" --strip-components=1
rsync -a --exclude data --exclude .venv --exclude .runtime --exclude node_modules --exclude models --exclude .git "$TMP/src/" ./
bash ./preparar.sh
if [ -z "$ESTUDIO_SIN_APP" ]; then
  APPS="/Applications"; [ -w "$APPS" ] || { APPS="$HOME/Applications"; mkdir -p "$APPS"; }
  rm -rf "$APPS/Estudio Marketographer.app"; cp -R Estudio.app "$APPS/Estudio Marketographer.app"
  mkdir -p "$HOME/Library/Application Support/EstudioMarketographer"; echo "$DEST" > "$HOME/Library/Application Support/EstudioMarketographer/ruta"
  xattr -dr com.apple.quarantine "$APPS/Estudio Marketographer.app" 2>/dev/null || true
  echo; echo "✅ Listo. Abre «Estudio Marketographer» desde $APPS."
else echo; echo "✅ Listo en $DEST."; fi
