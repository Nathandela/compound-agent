#!/usr/bin/env bash
#
# Startup benchmark for Go binary vs npx ca.
# Measures exec-to-first-stdout-byte latency over 100 runs.
# Reports: min, max, mean, p50, p95, p99, plus binary size.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BINARY="$SCRIPT_DIR/ca-spike"
RUNS=100

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# High-resolution timestamp in nanoseconds (macOS-compatible via python3)
now_ns() {
  python3 -c "import time; print(time.time_ns())"
}

# Measure exec-to-first-stdout-byte for a command.
# Prints elapsed nanoseconds to stdout.
measure_once() {
  local start end
  start=$(now_ns)
  "$@" > /dev/null
  end=$(now_ns)
  echo $(( end - start ))
}

# Run N measurements, collect into an array, compute stats via python3.
run_bench() {
  local label="$1"; shift
  local cmd=("$@")
  local results=()

  echo ""
  echo "=== $label ==="
  echo "Command: ${cmd[*]}"
  echo "Runs:    $RUNS"

  for ((i = 1; i <= RUNS; i++)); do
    ns=$(measure_once "${cmd[@]}")
    results+=("$ns")
    # Progress indicator every 25 runs
    if (( i % 25 == 0 )); then
      echo "  ... $i/$RUNS"
    fi
  done

  # Pipe measurements into python3 for stats
  printf '%s\n' "${results[@]}" | python3 -c "
import sys, statistics

vals = sorted(int(line) for line in sys.stdin if line.strip())
n = len(vals)

def pct(p):
    idx = int(p / 100.0 * (n - 1) + 0.5)
    return vals[min(idx, n - 1)]

def fmt(ns):
    ms = ns / 1_000_000
    if ms >= 1:
        return f'{ms:.2f} ms'
    return f'{ns / 1000:.1f} us'

print(f'  min:  {fmt(vals[0])}')
print(f'  max:  {fmt(vals[-1])}')
print(f'  mean: {fmt(int(statistics.mean(vals)))}')
print(f'  p50:  {fmt(pct(50))}')
print(f'  p95:  {fmt(pct(95))}')
print(f'  p99:  {fmt(pct(99))}')
print(f'  stdev: {fmt(int(statistics.stdev(vals)))}')
"
}

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

echo "=========================================="
echo " Go Startup Benchmark"
echo "=========================================="

cd "$SCRIPT_DIR"

echo ""
echo "--- Building static binary (CGO_ENABLED=0) ---"
CGO_ENABLED=0 go build -ldflags="-s -w" -o ca-spike .
STATIC_SIZE=$(stat -f%z ca-spike 2>/dev/null || stat --printf="%s" ca-spike)
echo "Binary size (static, stripped): $(echo "scale=2; $STATIC_SIZE / 1048576" | bc) MB ($STATIC_SIZE bytes)"

echo ""
echo "--- Building CGO binary (CGO_ENABLED=1) ---"
CGO_ENABLED=1 go build -ldflags="-s -w" -o ca-spike-cgo .
CGO_SIZE=$(stat -f%z ca-spike-cgo 2>/dev/null || stat --printf="%s" ca-spike-cgo)
echo "Binary size (CGO, stripped):    $(echo "scale=2; $CGO_SIZE / 1048576" | bc) MB ($CGO_SIZE bytes)"

# ---------------------------------------------------------------------------
# Benchmarks
# ---------------------------------------------------------------------------

# Warm the filesystem cache
"$BINARY" ping > /dev/null 2>&1 || true

echo ""
echo "--- Go binary: cold cache (purge disk cache hint) ---"
echo "(Note: true cold cache requires root purge; this simulates by first run after build)"

# Cold-ish: rebuild, then measure immediately
CGO_ENABLED=0 go build -ldflags="-s -w" -o ca-spike .
run_bench "Go binary - cold-ish start (static)" "$BINARY" ping

echo ""
echo "--- Go binary: warm cache ---"
# Pre-warm
for _ in {1..5}; do "$BINARY" ping > /dev/null 2>&1; done
run_bench "Go binary - warm cache (static)" "$BINARY" ping

echo ""
echo "--- Go binary: warm cache (CGO build) ---"
for _ in {1..5}; do "$SCRIPT_DIR/ca-spike-cgo" ping > /dev/null 2>&1; done
run_bench "Go binary - warm cache (CGO)" "$SCRIPT_DIR/ca-spike-cgo" ping

# ---------------------------------------------------------------------------
# npx ca comparison (if available)
# ---------------------------------------------------------------------------

echo ""
echo "--- npx ca --version (Node.js baseline) ---"

if command -v npx &>/dev/null; then
  # Check if ca is resolvable
  if npx ca --version &>/dev/null 2>&1; then
    run_bench "npx ca --version" npx ca --version
  else
    echo "  'npx ca' not resolvable, skipping."
    echo "  Measuring 'npx --version' as Node overhead baseline instead."
    run_bench "npx --version (Node overhead)" npx --version
  fi
else
  echo "  npx not found, skipping Node comparison."
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
echo "=========================================="
echo " Summary"
echo "=========================================="
echo ""
echo "Binary sizes:"
echo "  Static (CGO_ENABLED=0, stripped): $(echo "scale=2; $STATIC_SIZE / 1048576" | bc) MB"
echo "  CGO    (CGO_ENABLED=1, stripped): $(echo "scale=2; $CGO_SIZE / 1048576" | bc) MB"
echo ""
echo "Target: p95 startup < 50ms"
echo "=========================================="
