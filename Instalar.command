#!/bin/bash
# Prepara el Estudio (Node, Python, librerías y modelos). Se hace una sola vez; si lo repites, salta lo que ya está listo.
cd "$(dirname "$0")" || exit 1
clear
bash ./preparar.sh
echo
read -n 1 -s -r -p "Pulsa una tecla para cerrar"
