#!/usr/bin/env bash
# Run the Go-native benchmark (eliminates python3 subprocess overhead)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Native Go benchmarker (eliminates python3 subprocess overhead) ==="
echo ""

echo "--- Static binary (CGO_ENABLED=0) ---"
go run bench_native.go -binary ./ca-spike -args "ping" -runs 100

echo ""
echo "--- CGO binary (CGO_ENABLED=1) ---"
go run bench_native.go -binary ./ca-spike-cgo -args "ping" -runs 100

echo ""
echo "--- npx ca --version (Node.js baseline, 20 runs) ---"
if command -v npx &>/dev/null; then
  go run bench_native.go -binary "$(which npx)" -args "ca --version" -runs 20 -warmup 2
else
  echo "Skipped (npx not available)"
fi

echo ""
echo "--- Binary sizes ---"
echo "  Static: $(stat -f%z ./ca-spike 2>/dev/null || stat --printf='%s' ./ca-spike) bytes ($(echo "scale=2; $(stat -f%z ./ca-spike) / 1048576" | bc) MB)"
echo "  CGO:    $(stat -f%z ./ca-spike-cgo 2>/dev/null || stat --printf='%s' ./ca-spike-cgo) bytes ($(echo "scale=2; $(stat -f%z ./ca-spike-cgo) / 1048576" | bc) MB)"
