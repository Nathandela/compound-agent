package main

import (
	"encoding/json"
	"fmt"
	"os"

	llama "github.com/go-skynet/go-llama.cpp"
)

func main() {
	if len(os.Args) < 3 {
		fmt.Fprintf(os.Stderr, "Usage: embed <model-path> <text>\n")
		os.Exit(1)
	}

	modelPath := os.Args[1]
	text := os.Args[2]

	model, err := llama.New(modelPath, llama.SetContext(512))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to load model: %v\n", err)
		os.Exit(1)
	}
	defer model.Free()

	embeddings, err := model.Embeddings(text)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to embed: %v\n", err)
		os.Exit(1)
	}

	// Output as JSON array for easy parsing
	data, _ := json.Marshal(embeddings)
	fmt.Println(string(data))
}
