#!/bin/sh
# Makes one .zip per skill in dist/, ready to upload to Claude.
#   ./package-skills.sh        English skills (SKILL.md)
#   ./package-skills.sh --es   Spanish skills (SKILL.es.md becomes SKILL.md inside the zip)
set -e
cd "$(dirname "$0")"
lang=en
[ "$1" = "--es" ] && lang=es
mkdir -p dist
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
for d in skills/*/; do
  n=$(basename "$d")
  cp -R "skills/$n" "$tmp/$n"
  if [ "$lang" = es ] && [ -f "$tmp/$n/SKILL.es.md" ]; then
    mv "$tmp/$n/SKILL.es.md" "$tmp/$n/SKILL.md"
  else
    rm -f "$tmp/$n/SKILL.es.md"
  fi
  rm -rf "$tmp/$n/scripts/__pycache__"
  out="dist/$n.zip"
  [ "$lang" = es ] && out="dist/$n.es.zip"
  rm -f "$out"
  (cd "$tmp" && zip -qr "$OLDPWD/$out" "$n")
  echo "$out"
done
