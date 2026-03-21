package util

import (
	"fmt"
	"io"
	"time"
)

// ReadStdinFrom reads all data from r with timeout and size-limit protection.
// The size limit is enforced incrementally — at most maxBytes+1 bytes are read.
func ReadStdinFrom(r io.Reader, timeout time.Duration, maxBytes int) (string, error) {
	type result struct {
		data []byte
		err  error
	}

	ch := make(chan result, 1)
	go func() {
		// Read at most maxBytes+1 to detect overflow without buffering the full stream
		limited := io.LimitReader(r, int64(maxBytes)+1)
		data, err := io.ReadAll(limited)
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
