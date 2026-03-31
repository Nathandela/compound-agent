#!/bin/bash
# v3.0 Pipeline: infinity loop → polish loop (2 cycles)
# Launch: cd go && screen -dmS compound-loop-learning-agent bash v3-pipeline.sh

set -e
cd "$(dirname "$0")"

echo "[pipeline] Starting infinity loop..."
bash infinity-loop.sh

echo "[pipeline] Infinity loop complete. Starting polish loop (2 cycles)..."
bash polish-loop.sh

echo "[pipeline] v3.0 pipeline complete."
