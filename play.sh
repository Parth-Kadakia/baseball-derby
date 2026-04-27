#!/usr/bin/env bash
# DIAMOND STORM launcher — starts a local static server and opens the game.
cd "$(dirname "$0")"
PORT=${PORT:-8088}
echo "⚾ Starting DIAMOND STORM on http://localhost:${PORT}"
( sleep 0.8 && open "http://localhost:${PORT}/index.html" ) &
python3 -m http.server "${PORT}"
