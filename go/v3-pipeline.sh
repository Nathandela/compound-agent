#!/bin/bash
# v3.0 Pipeline: infinity loop → polish loop (2 cycles)
# Launch: screen -dmS compound-loop-learning-agent bash v3-pipeline.sh

set -e

echo "[pipeline] Starting infinity loop..."
bash infinity-loop.sh

echo "[pipeline] Infinity loop complete. Starting polish loop (2 cycles)..."
bash polish-loop.sh

echo "[pipeline] v3.0 pipeline complete."
