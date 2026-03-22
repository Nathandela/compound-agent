package embed

import (
	"bufio"
	"fmt"
	"net"
	"os"
	"sync"
	"time"
)

// Client connects to the embed daemon via Unix domain socket.
type Client struct {
	conn    net.Conn
	reader  *bufio.Reader
	mu      sync.Mutex
	timeout time.Duration
	reqID   int
}

// NewClient connects to the daemon at the given socket path.
func NewClient(socketPath string, timeout time.Duration) (*Client, error) {
	conn, err := net.DialTimeout("unix", socketPath, timeout)
	if err != nil {
		return nil, fmt.Errorf("connect to daemon: %w", err)
	}
	return &Client{
		conn:    conn,
		reader:  bufio.NewReader(conn),
		timeout: timeout,
	}, nil
}

// Close closes the connection to the daemon.
func (c *Client) Close() error {
	return c.conn.Close()
}

// sendLocked sends a request and waits for a response. Must be called with c.mu held.
func (c *Client) sendLocked(req Request) (*Response, error) {
	line, err := EncodeLine(req)
	if err != nil {
		return nil, fmt.Errorf("encode request: %w", err)
	}

	if err := c.conn.SetWriteDeadline(time.Now().Add(c.timeout)); err != nil {
		return nil, fmt.Errorf("set write deadline: %w", err)
	}
	if _, err := c.conn.Write(line); err != nil {
		return nil, fmt.Errorf("write request: %w", err)
	}

	if err := c.conn.SetReadDeadline(time.Now().Add(c.timeout)); err != nil {
		return nil, fmt.Errorf("set read deadline: %w", err)
	}
	respLine, err := c.reader.ReadBytes('\n')
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	return DecodeLine(respLine)
}

// Send sends a request and waits for a response.
func (c *Client) Send(req Request) (*Response, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.sendLocked(req)
}

// Health sends a health check request.
func (c *Client) Health() (*Response, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.reqID++
	return c.sendLocked(Request{
		ID:     fmt.Sprintf("health-%d", c.reqID),
		Method: "health",
	})
}

// Embed sends texts for embedding.
func (c *Client) Embed(texts []string) (*Response, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.reqID++
	return c.sendLocked(Request{
		ID:     fmt.Sprintf("embed-%d", c.reqID),
		Method: "embed",
		Texts:  texts,
	})
}

// Shutdown sends a shutdown request to the daemon.
func (c *Client) Shutdown() (*Response, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.reqID++
	return c.sendLocked(Request{
		ID:     fmt.Sprintf("shutdown-%d", c.reqID),
		Method: "shutdown",
	})
}

// IsSocketStale checks if a socket file exists but the daemon is not responding.
func IsSocketStale(socketPath string) bool {
	if _, err := os.Stat(socketPath); os.IsNotExist(err) {
		return true
	}
	conn, err := net.DialTimeout("unix", socketPath, 500*time.Millisecond)
	if err != nil {
		return true
	}
	conn.Close()
	return false
}

// CleanStaleSocket removes a stale socket and its PID file.
func CleanStaleSocket(socketPath string) {
	os.Remove(socketPath)
	os.Remove(PIDPath(socketPath))
}
