#!/bin/bash
# SPIDER Bridge -> GitHub Pages snapshot publisher.
# Alur: muse.db -> raw.json (oleh Muse) -> publish_state.py -> state.json
#       -> git commit/push -> GitHub Pages (polling, bukan real-time).
#
# Cara pakai (dijalankan dari root repo GitHub Pages):
#   ./push_snapshot.sh
#
# Prasyarat: repo sudah git init + remote origin terpasang + gh auth login.
# Catatan: di repo Pages, state.json harus FILE NYATA (bukan symlink).
set -euo pipefail
cd "$(dirname "$0")"

BRIDGE_DIR="$HOME/workspace/spider"

echo "== 1. refresh state.json kanonis dari raw.json =="
python3 "$BRIDGE_DIR/publish_state.py" --raw "$BRIDGE_DIR/raw.json" --out "$BRIDGE_DIR/state.json"

echo "== 2. salin snapshot ke repo sebagai file nyata =="
if [ -L state.json ]; then
  echo "   (melepas symlink lama)"
  rm state.json
fi
cp "$BRIDGE_DIR/state.json" state.json

echo "== 3. secret scan cepat sebelum commit =="
if grep -rniE "api[_-]?key|BEGIN [A-Z ]*PRIVATE KEY" state.json index.html app.js style.css 2>/dev/null | grep -v "secret scan"; then
  echo "STOP: pola sensitif ditemukan, batalkan push."
  exit 1
fi
echo "   bersih."

echo "== 4. commit + push snapshot =="
git add state.json
if git diff --cached --quiet; then
  echo "   tidak ada perubahan state, skip commit."
else
  git commit -m "snapshot: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  git push origin HEAD
  echo "   push OK."
fi
echo "Catatan: GitHub Pages butuh ~1 menit untuk serve state.json terbaru."
echo "Snapshot TIDAK otomatis berubah hanya karena Pages aktif —"
echo "setiap update butuh: Muse refresh raw.json -> ./push_snapshot.sh"
