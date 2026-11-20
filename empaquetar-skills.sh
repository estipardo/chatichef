#!/bin/sh
# Crea un .zip por skill en dist/, listo para subir a Claude.
set -e
cd "$(dirname "$0")"
mkdir -p dist
for d in skills/*/; do
  n=$(basename "$d")
  rm -f "dist/$n.zip"
  (cd skills && zip -qr "../dist/$n.zip" "$n" -x "*/__pycache__/*")
  echo "dist/$n.zip"
done
