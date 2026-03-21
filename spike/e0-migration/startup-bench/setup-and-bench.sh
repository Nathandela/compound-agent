#!/usr/bin/env bash
#
# One-shot: initialize module, fetch deps, build, and benchmark.
# Run: bash spike/e0-migration/startup-bench/setup-and-bench.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Setup ==="

# Re-init module cleanly (go mod tidy resolves everything)
rm -f go.sum
go mod tidy
echo "Dependencies resolved."

echo ""
echo "=== Running benchmark ==="
bash "$SCRIPT_DIR/bench.sh"
