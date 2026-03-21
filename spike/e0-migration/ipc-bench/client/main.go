// IPC embedding client: measures round-trip latency over Unix domain sockets.
// Validates assumption A3 (UDS IPC latency < 5ms).
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"math"
	"net"
	"os"
	"sort"
	"time"
)

type EmbedRequest struct {
	ID     string   `json:"id"`
	Method string   `json:"method"`
	Texts  []string `json:"texts,omitempty"`
}

type EmbedResponse struct {
	ID      string      `json:"id,omitempty"`
	Vectors [][]float32 `json:"vectors,omitempty"`
	Status  string      `json:"status,omitempty"`
	Error   string      `json:"error,omitempty"`
}

func printStats(label string, latencies []time.Duration) {
	n := len(latencies)
	sort.Slice(latencies, func(i, j int) bool {
		return latencies[i] < latencies[j]
	})

	var totalNs int64
	for _, d := range latencies {
		totalNs += d.Nanoseconds()
	}

	minL := latencies[0]
	maxL := latencies[n-1]
	meanL := time.Duration(totalNs / int64(n))
	p50 := latencies[int(math.Floor(float64(n)*0.50))]
	p95 := latencies[int(math.Floor(float64(n)*0.95))]
	p99 := latencies[int(math.Floor(float64(n)*0.99))]

	fmt.Printf("--- %s (%d requests) ---\n", label, n)
	fmt.Printf("  Min:   %v\n", minL)
	fmt.Printf("  Max:   %v\n", maxL)
	fmt.Printf("  Mean:  %v\n", meanL)
	fmt.Printf("  p50:   %v\n", p50)
	fmt.Printf("  p95:   %v\n", p95)
	fmt.Printf("  p99:   %v\n", p99)
	fmt.Println()
}

func main() {
	socketPath := "/tmp/ca-embed-spike.sock"
	if len(os.Args) > 1 {
		socketPath = os.Args[1]
	}

	numRequests := 1000
	if len(os.Args) > 2 {
		fmt.Sscanf(os.Args[2], "%d", &numRequests)
	}

	conn, err := net.Dial("unix", socketPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to connect: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close()

	reader := bufio.NewReader(conn)

	// Health check
	healthReq := EmbedRequest{Method: "health"}
	data, _ := json.Marshal(healthReq)
	fmt.Fprintf(conn, "%s\n", data)

	line, err := reader.ReadString('\n')
	if err != nil {
		fmt.Fprintf(os.Stderr, "Health check failed: %v\n", err)
		os.Exit(1)
	}

	var healthResp EmbedResponse
	json.Unmarshal([]byte(line), &healthResp)
	if healthResp.Status != "ok" {
		fmt.Fprintf(os.Stderr, "Server not healthy: %s\n", line)
		os.Exit(1)
	}
	fmt.Fprintf(os.Stderr, "[OK] Server healthy\n")

	// --- Phase 1: Ping benchmark (IPC-only latency) ---
	fmt.Fprintf(os.Stderr, "Running %d ping requests (IPC-only)...\n", numRequests)
	pingLatencies := make([]time.Duration, numRequests)

	for i := 0; i < numRequests; i++ {
		req := EmbedRequest{Method: "ping"}
		data, _ := json.Marshal(req)

		start := time.Now()
		fmt.Fprintf(conn, "%s\n", data)
		_, err := reader.ReadString('\n')
		elapsed := time.Since(start)

		if err != nil {
			fmt.Fprintf(os.Stderr, "Ping %d failed: %v\n", i, err)
			os.Exit(1)
		}
		pingLatencies[i] = elapsed
	}
	fmt.Fprintf(os.Stderr, "[OK] Ping benchmark complete\n")

	// --- Phase 2: Warmup embedding ---
	fmt.Fprintf(os.Stderr, "Warming up (5 embed requests)...\n")
	for i := 0; i < 5; i++ {
		req := EmbedRequest{
			ID:     fmt.Sprintf("warmup-%d", i),
			Method: "embed",
			Texts:  []string{"warmup text"},
		}
		data, _ := json.Marshal(req)
		fmt.Fprintf(conn, "%s\n", data)
		_, err := reader.ReadString('\n')
		if err != nil {
			fmt.Fprintf(os.Stderr, "Warmup request %d failed: %v\n", i, err)
			os.Exit(1)
		}
	}
	fmt.Fprintf(os.Stderr, "[OK] Warmup complete\n")

	// --- Phase 3: Embedding benchmark (IPC + inference) ---
	fmt.Fprintf(os.Stderr, "Running %d embedding requests...\n", numRequests)
	embedLatencies := make([]time.Duration, numRequests)
	var vectorDim int

	texts := []string{
		"hello world",
		"this is a test of embedding latency",
		"compound agent learns from mistakes",
		"unix domain sockets are fast",
		"how quickly can we embed text",
	}

	for i := 0; i < numRequests; i++ {
		text := texts[i%len(texts)]
		req := EmbedRequest{
			ID:     fmt.Sprintf("req-%d", i),
			Method: "embed",
			Texts:  []string{text},
		}
		data, _ := json.Marshal(req)

		start := time.Now()
		fmt.Fprintf(conn, "%s\n", data)
		line, err := reader.ReadString('\n')
		elapsed := time.Since(start)

		if err != nil {
			fmt.Fprintf(os.Stderr, "Request %d failed: %v\n", i, err)
			os.Exit(1)
		}

		var resp EmbedResponse
		if err := json.Unmarshal([]byte(line), &resp); err != nil {
			fmt.Fprintf(os.Stderr, "Parse error on request %d: %v\n", i, err)
			os.Exit(1)
		}
		if resp.Error != "" {
			fmt.Fprintf(os.Stderr, "Server error on request %d: %s\n", i, resp.Error)
			os.Exit(1)
		}

		embedLatencies[i] = elapsed

		if vectorDim == 0 && len(resp.Vectors) > 0 {
			vectorDim = len(resp.Vectors[0])
		}
	}

	// --- Results ---
	fmt.Println("=== IPC Embedding Benchmark Results ===")
	fmt.Printf("Vector dim:  %d\n\n", vectorDim)

	printStats("Ping (IPC-only)", pingLatencies)
	printStats("Embed (IPC + inference)", embedLatencies)

	// Compute IPC overhead estimate
	sort.Slice(pingLatencies, func(i, j int) bool { return pingLatencies[i] < pingLatencies[j] })
	sort.Slice(embedLatencies, func(i, j int) bool { return embedLatencies[i] < embedLatencies[j] })

	pingP95 := pingLatencies[int(math.Floor(float64(numRequests)*0.95))]
	embedP95 := embedLatencies[int(math.Floor(float64(numRequests)*0.95))]

	fmt.Println("--- Validation ---")
	fmt.Printf("  IPC-only p95:    %v\n", pingP95)
	fmt.Printf("  Embed p95:       %v\n", embedP95)
	fmt.Printf("  Inference est:   ~%v (embed p50 - ping p50)\n",
		embedLatencies[int(math.Floor(float64(numRequests)*0.50))]-
			pingLatencies[int(math.Floor(float64(numRequests)*0.50))])
	fmt.Println()

	if pingP95 < 5*time.Millisecond {
		fmt.Println("[PASS] A3 VALIDATED: IPC round-trip p95 < 5ms")
		fmt.Printf("       IPC overhead is negligible (%v p95)\n", pingP95)
	} else {
		fmt.Printf("[FAIL] A3 NOT MET: IPC-only p95=%v (target < 5ms)\n", pingP95)
	}

	if embedP95 < 5*time.Millisecond {
		fmt.Println("[PASS] Full embed round-trip p95 < 5ms (bonus!)")
	} else {
		fmt.Printf("[INFO] Full embed p95=%v (includes ~%v inference time)\n",
			embedP95,
			embedLatencies[int(math.Floor(float64(numRequests)*0.50))]-
				pingLatencies[int(math.Floor(float64(numRequests)*0.50))])
	}
}
