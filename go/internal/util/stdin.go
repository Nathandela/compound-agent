package util

import (
	"fmt"
	"io"
	"time"
)

// ReadStdinFrom reads all data from r with timeout and size-limit protection.
func ReadStdinFrom(r io.Reader, timeout time.Duration, maxBytes int) (string, error) {
	type result struct {
		data []byte
		err  error
	}

	ch := make(chan result, 1)
	go func() {
		data, err := io.ReadAll(r)
		ch <- result{data, err}
	}()

	select {
	case res := <-ch:
		if res.err != nil {
			return "", res.err
		}
		if len(res.data) > maxBytes {
			return "", fmt.Errorf("stdin exceeds %d byte limit", maxBytes)
		}
		return string(res.data), nil
	case <-time.After(timeout):
		return "", fmt.Errorf("stdin read timed out")
	}
}
