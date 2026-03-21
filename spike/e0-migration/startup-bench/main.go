package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
)

// Simulate a realistic import graph by using these packages in init.
// This ensures the Go linker includes them and startup pays the cost.
var (
	_ = json.Marshal
	_ = os.Getenv
	_ = filepath.Join
)

func main() {
	rootCmd := &cobra.Command{
		Use:   "ca",
		Short: "Compound Agent CLI (Go spike)",
	}

	pingCmd := &cobra.Command{
		Use:   "ping",
		Short: "Print pong and exit",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Println("pong")
		},
	}

	versionCmd := &cobra.Command{
		Use:   "version",
		Short: "Print version",
		Run: func(cmd *cobra.Command, args []string) {
			data, _ := json.Marshal(map[string]string{
				"version": "0.0.1-spike",
				"built":   "static",
			})
			fmt.Println(string(data))
		},
	}

	rootCmd.AddCommand(pingCmd, versionCmd)

	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}
