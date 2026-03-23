package embed

import (
	"errors"
	"io"
	"net"
)

// isConnectionError returns true if the error indicates a broken connection.
func isConnectionError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
		return true
	}
	var netErr *net.OpError
	return errors.As(err, &netErr)
}

// RetryClient wraps a Client with automatic retry on connection failure (H2).
// On broken connection, it reconnects via the provided connect function
// and retries the request once.
//
// RetryClient is not safe for concurrent use. Callers must serialize
// access or use separate RetryClient instances per goroutine.
type RetryClient struct {
	client  *Client
	connect func() (*Client, error)
}

// NewRetryClient creates a retry-capable client wrapper.
// The connect function is called to obtain fresh connections on failure.
func NewRetryClient(client *Client, connect func() (*Client, error)) *RetryClient {
	return &RetryClient{client: client, connect: connect}
}

// Health sends a health check with retry on connection failure.
func (rc *RetryClient) Health() (*Response, error) {
	resp, err := rc.client.Health()
	if err != nil && isConnectionError(err) {
		if reconnErr := rc.reconnect(); reconnErr != nil {
			return nil, reconnErr
		}
		return rc.client.Health()
	}
	return resp, err
}

// Embed sends texts for embedding with retry on connection failure.
func (rc *RetryClient) Embed(texts []string) (*Response, error) {
	resp, err := rc.client.Embed(texts)
	if err != nil && isConnectionError(err) {
		if reconnErr := rc.reconnect(); reconnErr != nil {
			return nil, reconnErr
		}
		return rc.client.Embed(texts)
	}
	return resp, err
}

// Shutdown sends a shutdown request (no retry — shutdown is intentional).
func (rc *RetryClient) Shutdown() (*Response, error) {
	return rc.client.Shutdown()
}

// Close closes the underlying client connection.
func (rc *RetryClient) Close() error {
	return rc.client.Close()
}

// reconnect closes the old connection and establishes a new one.
func (rc *RetryClient) reconnect() error {
	rc.client.Close()
	newClient, err := rc.connect()
	if err != nil {
		return err
	}
	rc.client = newClient
	return nil
}
