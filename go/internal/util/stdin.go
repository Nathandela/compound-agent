package util

import (
	"fmt"
	"io"
	"time"
)

// ReadStdinFrom reads all data from r with timeout and size-limit protection.
// The size limit is enforced incrementally — at most maxBytes+1 bytes are read.
// On timeout, the internal pipe is closed so the copy goroutine unblocks.
func ReadStdinFrom(r io.Reader, timeout time.Duration, maxBytes int) (string, error) {
	type result struct {
		data []byte
		err  error
	}

	ch := make(chan result, 1)
	pr, pw := io.Pipe()

	// Copy goroutine: reads from r, writes to pipe.
	// NOTE: On timeout, this goroutine may remain blocked on r.Read() if the
	// underlying reader (e.g. stdin) never returns. This is an inherent limitation
	// of Go's non-interruptible blocking reads. The goroutine is cleaned up when
	// the process exits. This is acceptable because ReadStdinFrom is only used
	// in short-lived hook contexts, never in long-lived servers.
	go func() {
		_, err := io.Copy(pw, io.LimitReader(r, int64(maxBytes)+1))
		pw.CloseWithError(err)
	}()

	// Read goroutine: reads from pipe
	go func() {
		data, err := io.ReadAll(pr)
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
		pr.CloseWithError(fmt.Errorf("timeout"))
		pw.CloseWithError(fmt.Errorf("timeout"))
		return "", fmt.Errorf("stdin read timed out")
	}
}
