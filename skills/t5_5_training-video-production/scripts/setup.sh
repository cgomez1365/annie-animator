#!/bin/bash
# One-time setup for the ai-training-video skill. Safe to re-run.
#  - kokoro-js (local voice) goes in scripts/node_modules (reuses the copy already on this Mac if it is there)
#  - AIV_FFMPEG / AIV_CANVAS default to the copies inside the AEON install on this Mac
#  - generates the three music beds A/D/E (4 min each, about 1 min), too big to ship in the folder
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OLD="$HERE/../vo/node_modules"   # moved here 2026-11-21 (it used to sit in the trashed 28 s card folder)
if [ ! -e "$HERE/node_modules" ]; then
  if [ -d "$OLD/kokoro-js" ]; then ln -s "$OLD" "$HERE/node_modules"; echo "linked kokoro-js from ../vo/node_modules"
  else (cd "$HERE" && npm init -y >/dev/null && npm install kokoro-js@1.2.1); fi
fi
echo 'export AIV_FFMPEG=/Users/cris/Desktop/AEON/node_modules/ffmpeg-static/ffmpeg'
echo 'export AIV_CANVAS=/Users/cris/Desktop/AEON/node_modules/@napi-rs/canvas/index.js'
echo '(put those two lines in your shell before running render.mjs; vo.mjs needs the sandbox off)'
mkdir -p "$HERE/../assets/music"
[ -f "$HERE/../assets/music/E_bossa_nova.wav" ] || node "$HERE/music.mjs" 240
echo ready
