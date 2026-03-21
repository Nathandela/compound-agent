#!/bin/bash
# Build and test the npm binary distribution spike
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Detect platform the way Node.js will see it
NODE_OS="$(node -e "console.log(process.platform)")"
NODE_ARCH_RAW="$(node -e "console.log(process.arch)")"

# Map Node arch to Go arch
case "$NODE_ARCH_RAW" in
  x64)   GO_ARCH="amd64" ;;
  arm64) GO_ARCH="arm64" ;;
  *)     echo "Unsupported arch: $NODE_ARCH_RAW"; exit 1 ;;
esac

PLATFORM_KEY="${NODE_OS}-${GO_ARCH}"
BINARY_NAME="ca-spike-${PLATFORM_KEY}"

echo "=== Step 1: Build Go binary ==="
echo "Node platform: ${NODE_OS}/${NODE_ARCH_RAW} -> Go target: ${NODE_OS}/${GO_ARCH}"
cd "$SCRIPT_DIR/go-binary"
go mod tidy

# Cross-compile for the platform Node will detect
CGO_ENABLED=0 GOOS="$NODE_OS" GOARCH="$GO_ARCH" go build -ldflags="-s -w" -o "bin/$BINARY_NAME" .
echo "Build successful: bin/$BINARY_NAME"

# Report binary size
SIZE=$(stat -f%z "bin/$BINARY_NAME" 2>/dev/null || stat -c%s "bin/$BINARY_NAME")
SIZE_MB=$(echo "scale=2; $SIZE / 1048576" | bc)
echo "Binary size: ${SIZE_MB} MB ($SIZE bytes)"

echo ""
echo "=== Step 2: Test Go binary directly ==="
"./bin/$BINARY_NAME" version
"./bin/$BINARY_NAME" hello

echo ""
echo "=== Step 3: npm install (triggers postinstall) ==="
cd "$SCRIPT_DIR/npm-package"
npm install --ignore-scripts=false

echo ""
echo "=== Step 4: Test via npm wrapper ==="
node bin/ca-spike version
node bin/ca-spike hello

echo ""
echo "=== Step 5: Test via npx ==="
npx ca-spike version
npx ca-spike hello

echo ""
echo "=== RESULTS ==="
echo "Platform: $PLATFORM_KEY"
echo "Binary size: ${SIZE_MB} MB"
echo "Target: < 20 MB"
if (( $(echo "$SIZE_MB < 20" | bc -l) )); then
  echo "PASS: Binary is under 20 MB"
else
  echo "FAIL: Binary exceeds 20 MB"
fi
echo ""
echo "All tests passed. The esbuild-style npm distribution pattern works."
