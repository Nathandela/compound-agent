package main

import (
	"fmt"
	"os"
	"runtime"

	"github.com/spf13/cobra"
)

var version = "0.0.1-spike"

func main() {
	rootCmd := &cobra.Command{
		Use:   "ca-spike",
		Short: "Compound Agent spike binary",
	}

	rootCmd.AddCommand(&cobra.Command{
		Use:   "version",
		Short: "Print version info",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Printf("ca-spike %s (%s/%s)\n", version, runtime.GOOS, runtime.GOARCH)
		},
	})

	rootCmd.AddCommand(&cobra.Command{
		Use:   "hello",
		Short: "Print hello message",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Println("Hello from Go binary")
		},
	})

	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}
