#!/bin/bash
# Arma el instalable: dist/Estudio-Marketographer-<versión>.dmg  (la app trae el código; la primera vez se prepara sola).
set -e
cd "$(dirname "$0")/.." || exit 1
VERSION="$(cat VERSION)"
DIST="dist"; APP="$DIST/stage/Estudio Marketographer.app"
rm -rf "$DIST/stage"; mkdir -p "$APP"
cp -R Estudio.app/Contents "$APP/"
mkdir -p "$APP/Contents/Resources/codigo"
rsync -a --exclude .git --exclude data --exclude .venv --exclude .runtime --exclude node_modules --exclude dist --exclude Estudio.app \
  --exclude 'modules/talking-head/engine/models' --exclude '*.tgz' --exclude '*.zip' --exclude '.DS_Store' --exclude '__pycache__' --exclude 'PLAN*.md' ./ "$APP/Contents/Resources/codigo/"
# la copia de la app que viaja dentro del código (para instalar por el comando de Terminal)
mkdir -p "$APP/Contents/Resources/codigo/Estudio.app" && cp -R Estudio.app/Contents "$APP/Contents/Resources/codigo/Estudio.app/"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $VERSION" -c "Add :CFBundleShortVersionString string $VERSION" "$APP/Contents/Info.plist" 2>/dev/null || /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$APP/Contents/Info.plist"
chmod +x "$APP/Contents/MacOS/Estudio"
codesign --force --deep -s - "$APP" 2>/dev/null || echo "(sin firmar: macOS pedirá 'Abrir' la primera vez)"
ln -s /Applications "$DIST/stage/Aplicaciones"
cat > "$DIST/stage/LEEME.txt" <<'TXT'
Estudio Marketographer

1. Arrastra "Estudio Marketographer" a la carpeta Aplicaciones.
2. Ábrelo. La primera vez macOS puede decir que no puede verificar al desarrollador:
   haz clic derecho sobre la app > Abrir > Abrir. Solo pasa una vez.
3. La primera vez se prepara solo (baja unos 1,5 GB y tarda unos minutos; necesita internet solo esa vez).
4. Después abre en segundos, funciona sin internet y avisa cuando hay una versión nueva.

Tus videos y proyectos viven en la carpeta EstudioMarketographer de tu usuario y no se borran al actualizar.
TXT
DMG="$DIST/Estudio-Marketographer-$VERSION.dmg"
rm -f "$DMG"
hdiutil create -volname "Estudio Marketographer" -srcfolder "$DIST/stage" -ov -format UDZO "$DMG" >/dev/null
echo "Listo: $DMG ($(du -h "$DMG" | cut -f1))"
