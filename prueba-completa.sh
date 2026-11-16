#!/bin/bash
# Prueba de punta a punta del Estudio: sube un clip corto, lo analiza, hace el video final y lo exporta para redes.
# Uso (con el Estudio abierto):  bash prueba-completa.sh <video-de-origen.mp4> [segundos]
# Crea un proyecto de prueba, mide cuánto tarda cada etapa y lo borra al terminar. No toca tus proyectos.
set -u
SRC="${1:?Falta el video de origen}"; SEG="${2:-12}"
API=http://localhost:4177/api/talking-head
TMP=$(mktemp -d); CLIP="$TMP/clip.mp4"
ffmpeg -loglevel error -y -ss 5 -t "$SEG" -i "$SRC" -c:v libx264 -preset veryfast -crf 20 -c:a aac "$CLIP" || { echo "FALLA: no pude cortar el clip"; exit 1; }

ID=$(curl -s -X POST -H 'Content-Type: application/octet-stream' --data-binary @"$CLIP" "$API/subir?nombre=prueba-completa.mp4" | sed -E 's/.*"id":"([a-z0-9]+)".*/\1/')
[ -n "$ID" ] || { echo "FALLA: la subida no devolvió un proyecto"; exit 1; }
echo "Proyecto de prueba: $ID"
limpiar() { curl -s -X DELETE "$API/proyectos/$ID" >/dev/null; rm -rf "$TMP"; }

# Espera a que termine el proceso en marcha. $1 = nombre de la etapa, $2 = segundos máximos.
esperar() {
  local t0=$(date +%s)
  sleep 2
  while curl -s "$API/proyectos/$ID/estado" | grep -q '"corriendo":true'; do
    [ $(( $(date +%s) - t0 )) -gt "$2" ] && { echo "FALLA: $1 pasó de $2 s"; tail -5 "data/th/$ID/motor.log" 2>/dev/null; limpiar; exit 1; }
    sleep 2
  done
  echo "$1: $(( $(date +%s) - t0 )) s"
}
paso() { # $1 = etapa, $2 = ruta, $3 = cuerpo JSON, $4 = segundos máximos
  local r; r=$(curl -s -X POST -H 'Content-Type: application/json' -d "$3" "$API/proyectos/$ID/$2")
  echo "$r" | grep -q '"error"' && { echo "FALLA al lanzar $1: $r"; limpiar; exit 1; }
  esperar "$1" "$4"
}

paso "Analizar" analizar '{}' 600
curl -s "$API/proyectos/$ID/estado" | grep -q '"analizado":true' || { echo "FALLA: el análisis no dejó plan"; tail -8 "data/th/$ID/motor.log"; limpiar; exit 1; }
paso "Video final" renderizar '{"calidad":"final"}' 600
curl -s "$API/proyectos/$ID/estado" | grep -q '"tieneFinal":true' || { echo "FALLA: no se creó el video final"; tail -8 "data/th/$ID/motor.log"; limpiar; exit 1; }
paso "Exportar para redes" exportar '{"preset":"redes"}' 300
OUT=$(curl -s "$API/proyectos/$ID/exportados")
echo "$OUT" | grep -q '"nombre"' || { echo "FALLA: no hay archivo exportado"; limpiar; exit 1; }
F=$(ls "data/th/$ID/export/"*.mp4 | head -1)
ffprobe -v error -show_entries stream=codec_name,width,height,duration -of csv=p=0 "$F" | tr '\n' ' '; echo
echo "Exportado: $OUT"
limpiar
echo "TODO BIEN"
