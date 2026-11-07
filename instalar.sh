#!/bin/bash
# Instala (o actualiza) el Estudio Marketographer en esta Mac. Se puede volver a correr cuando quieras: actualiza sin tocar tus videos.
#   curl -fsSL https://raw.githubusercontent.com/themarketographer/marketographer-studio/main/instalar.sh | bash
# Variables opcionales: ESTUDIO_DIR (dónde vive, por defecto ~/EstudioMarketographer), ESTUDIO_REPO, ESTUDIO_BRANCH,
# ESTUDIO_SALTAR_MOTOR=1 (no instala Python ni modelos), ESTUDIO_SIN_APP=1 (no crea la app en Aplicaciones).
set -e
REPO="${ESTUDIO_REPO:-https://github.com/themarketographer/marketographer-studio.git}"
BRANCH="${ESTUDIO_BRANCH:-main}"
DEST="${ESTUDIO_DIR:-$HOME/EstudioMarketographer}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

paso() { printf '\n\033[1m%s\033[0m\n' "$1"; }
falta() { echo; echo "⚠️  $1"; exit 1; }

[ "$(uname)" = "Darwin" ] || falta "Por ahora el instalador es solo para Mac."

paso "1/6 Revisando herramientas"
command -v git >/dev/null 2>&1 || { xcode-select --install 2>/dev/null || true; falta "Falta git. Se abrió la instalación de las herramientas de Apple: termínala y vuelve a pegar el comando."; }
if ! command -v brew >/dev/null 2>&1 && { ! command -v node >/dev/null 2>&1 || { [ -z "$ESTUDIO_SALTAR_MOTOR" ] && ! command -v python3 >/dev/null 2>&1; }; }; then
  falta "Falta instalar Homebrew (brew.sh). Pega la línea de esa página, y después vuelve a pegar este comando."
fi
command -v node >/dev/null 2>&1 || { echo "Instalando Node.js..."; brew install node; }
if [ -z "$ESTUDIO_SALTAR_MOTOR" ]; then
  command -v python3 >/dev/null 2>&1 || { echo "Instalando Python..."; brew install python; }
fi

paso "2/6 Bajando el código ($BRANCH)"
if [ -d "$DEST/.git" ]; then
  git -C "$DEST" fetch --quiet origin "$BRANCH"
  git -C "$DEST" checkout --quiet "$BRANCH" 2>/dev/null || git -C "$DEST" checkout --quiet -b "$BRANCH" "origin/$BRANCH"
  git -C "$DEST" merge --ff-only --quiet "origin/$BRANCH" || falta "Cambiaste archivos del código y no se pueden mezclar solos. Tus videos están a salvo (viven en $DEST/data)."
else
  git clone --quiet --branch "$BRANCH" "$REPO" "$DEST"
fi
cd "$DEST"

paso "3/6 Instalando lo del servidor"
npm install --omit=dev --no-audit --no-fund --loglevel=error

if [ -z "$ESTUDIO_SALTAR_MOTOR" ]; then
  paso "4/6 Instalando el motor de video (la primera vez tarda unos minutos)"
  [ -x .venv/bin/python ] || python3 -m venv .venv
  ./.venv/bin/python -m pip install --quiet --upgrade pip
  ./.venv/bin/python -m pip install --quiet -r modules/talking-head/engine/requirements.txt
  paso "5/6 Bajando los modelos (recorte de fondo y voz)"
  ./.venv/bin/python - <<'PY'
import sys
sys.path.insert(0, "modules/talking-head/engine")
import common
common.ensure_model()
from faster_whisper import WhisperModel
WhisperModel("small", device="cpu", compute_type="int8")
print("Modelos listos.")
PY
else
  paso "4/6 y 5/6 Motor de video: omitido"
fi

paso "6/6 Creando la app"
mkdir -p data
if [ -z "$ESTUDIO_SIN_APP" ]; then
  APPS="/Applications"; [ -w "$APPS" ] || { APPS="$HOME/Applications"; mkdir -p "$APPS"; }
  rm -rf "$APPS/Estudio Marketographer.app"
  cp -R Estudio.app "$APPS/Estudio Marketographer.app"
  mkdir -p "$HOME/Library/Application Support/EstudioMarketographer"
  echo "$DEST" > "$HOME/Library/Application Support/EstudioMarketographer/ruta"
  xattr -dr com.apple.quarantine "$APPS/Estudio Marketographer.app" 2>/dev/null || true
  echo "App lista en: $APPS/Estudio Marketographer.app"
fi
echo; echo "✅ Listo. Ábrela desde Aplicaciones (o con: open \"$APPS/Estudio Marketographer.app\")."
echo "   Para actualizar en el futuro, vuelve a pegar el mismo comando."
