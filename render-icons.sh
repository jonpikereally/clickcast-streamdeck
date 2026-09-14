#!/bin/zsh
# Regenerate the plugin's PNG icons (144 + @2x) from the SVG sources.
set -e
cd "$(dirname "$0")"
CACHE="${TMPDIR:-/tmp}/clickcast-modcache"
BIN="${TMPDIR:-/tmp}/clickcast-rasterize"
mkdir -p "$CACHE"
swiftc -module-cache-path "$CACHE" -o "$BIN" tools/rasterize.swift 2>&1 | grep -v xcrun_db || true
for f in com.jonpike.clickcastdeck.sdPlugin/imgs/*.svg; do
  "$BIN" "$f" "${f%.svg}"
done
echo "Rendered $(ls com.jonpike.clickcastdeck.sdPlugin/imgs/*.png | wc -l | tr -d ' ') PNGs"
