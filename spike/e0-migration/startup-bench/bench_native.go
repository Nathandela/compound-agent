// bench_native.go - Accurate startup benchmark using Go for timing.
// Eliminates python3 subprocess overhead from measurements.
//
// Usage: go run bench_native.go -binary ./ca-spike -runs 100
//
// This is a standalone tool, not part of the ca-spike binary.
//go:build ignore

package main

import (
	"flag"
	"fmt"
	"math"
	"os"
	"os/exec"
	"sort"
	"strings"
	"time"
)

func main() {
	binary := flag.String("binary", "./ca-spike", "path to binary")
	args := flag.String("args", "ping", "space-separated arguments to pass")
	runs := flag.Int("runs", 100, "number of runs")
	warmup := flag.Int("warmup", 5, "warmup runs (not counted)")
	flag.Parse()

	if _, err := os.Stat(*binary); err != nil {
		fmt.Fprintf(os.Stderr, "binary not found: %s\n", *binary)
		os.Exit(1)
	}

	argList := strings.Fields(*args)

	fmt.Printf("Binary:  %s %s\n", *binary, *args)
	fmt.Printf("Runs:    %d (warmup: %d)\n", *runs, *warmup)
	fmt.Println()

	// Warmup
	for i := 0; i < *warmup; i++ {
		cmd := exec.Command(*binary, argList...)
		cmd.Stdout = nil
		cmd.Stderr = nil
		_ = cmd.Run()
	}

	// Measure
	durations := make([]time.Duration, 0, *runs)
	for i := 0; i < *runs; i++ {
		cmd := exec.Command(*binary, argList...)
		cmd.Stdout = nil
		cmd.Stderr = nil

		start := time.Now()
		err := cmd.Run()
		elapsed := time.Since(start)

		if err != nil {
			fmt.Fprintf(os.Stderr, "run %d failed: %v\n", i+1, err)
			continue
		}
		durations = append(durations, elapsed)

		if (i+1)%25 == 0 {
			fmt.Printf("  ... %d/%d\n", i+1, *runs)
		}
	}

	if len(durations) == 0 {
		fmt.Fprintln(os.Stderr, "no successful runs")
		os.Exit(1)
	}

	// Sort for percentile calculation
	sort.Slice(durations, func(i, j int) bool { return durations[i] < durations[j] })

	n := len(durations)
	var sum time.Duration
	for _, d := range durations {
		sum += d
	}
	mean := sum / time.Duration(n)

	pct := func(p float64) time.Duration {
		idx := int(p/100.0*float64(n-1) + 0.5)
		if idx >= n {
			idx = n - 1
		}
		return durations[idx]
	}

	// Stdev
	var variance float64
	meanNs := float64(mean.Nanoseconds())
	for _, d := range durations {
		diff := float64(d.Nanoseconds()) - meanNs
		variance += diff * diff
	}
	stdev := time.Duration(math.Sqrt(variance / float64(n)))

	fmtDur := func(d time.Duration) string {
		us := d.Microseconds()
		if us < 1000 {
			return fmt.Sprintf("%d us", us)
		}
		return fmt.Sprintf("%.2f ms", float64(us)/1000.0)
	}

	fmt.Println()
	fmt.Printf("  min:   %s\n", fmtDur(durations[0]))
	fmt.Printf("  max:   %s\n", fmtDur(durations[n-1]))
	fmt.Printf("  mean:  %s\n", fmtDur(mean))
	fmt.Printf("  p50:   %s\n", fmtDur(pct(50)))
	fmt.Printf("  p95:   %s\n", fmtDur(pct(95)))
	fmt.Printf("  p99:   %s\n", fmtDur(pct(99)))
	fmt.Printf("  stdev: %s\n", fmtDur(stdev))
}
