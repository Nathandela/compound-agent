#!/usr/bin/env bash
# IPC embedding benchmark: starts Rust server, runs Go client, reports results.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOCKET_PATH="/tmp/ca-embed-spike.sock"
NUM_REQUESTS="${1:-1000}"

# Clean up on exit
cleanup() {
    if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
        echo "Cleaning up server (PID $SERVER_PID)..."
        kill "$SERVER_PID" 2>/dev/null || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi
    rm -f "$SOCKET_PATH"
}
trap cleanup EXIT

# Remove stale socket
rm -f "$SOCKET_PATH"

echo "=== IPC Embedding Benchmark ==="
echo "Socket: $SOCKET_PATH"
echo "Requests: $NUM_REQUESTS"
echo

# Build server
echo "--- Building Rust server ---"
(cd "$SCRIPT_DIR/server" && source "$HOME/.cargo/env" && cargo build --release 2>&1)
echo

# Build client
echo "--- Building Go client ---"
(cd "$SCRIPT_DIR/client" && go build -o ipc-bench-client main.go 2>&1)
echo

# Start server
echo "--- Starting server ---"
"$SCRIPT_DIR/server/target/release/ipc-embed-server" "$SOCKET_PATH" &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Wait for socket to appear (health check)
echo "Waiting for server to be ready..."
MAX_WAIT=60
WAITED=0
while [[ ! -S "$SOCKET_PATH" ]]; do
    sleep 1
    WAITED=$((WAITED + 1))
    if [[ $WAITED -ge $MAX_WAIT ]]; then
        echo "ERROR: Server did not create socket within ${MAX_WAIT}s"
        exit 1
    fi
    # Check server is still alive
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        echo "ERROR: Server process died"
        exit 1
    fi
done
echo "Socket appeared after ${WAITED}s"

# Give it a moment to start accepting connections
sleep 1
echo "[OK] Server ready"
echo

# Run benchmark
echo "--- Running benchmark ---"
"$SCRIPT_DIR/client/ipc-bench-client" "$SOCKET_PATH" "$NUM_REQUESTS"
BENCH_EXIT=$?
echo

# Send shutdown
echo "--- Sending shutdown ---"
# Use a fresh connection to send shutdown (the client already disconnected)
echo '{"method":"shutdown"}' | socat - UNIX-CONNECT:"$SOCKET_PATH" 2>/dev/null || \
    python3 -c "
import socket, json
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.connect('$SOCKET_PATH')
s.sendall(b'{\"method\":\"shutdown\"}\n')
resp = s.recv(4096)
print('Shutdown response:', resp.decode().strip())
s.close()
" 2>/dev/null || true

# Wait for server to exit
wait "$SERVER_PID" 2>/dev/null || true
SERVER_PID=""
echo "[OK] Server stopped"

exit $BENCH_EXIT
