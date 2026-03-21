package embed

import "encoding/json"

// Request is the JSON-lines request sent to the embed daemon.
type Request struct {
	ID     string   `json:"id"`
	Method string   `json:"method"`
	Texts  []string `json:"texts,omitempty"`
}

// Response is the JSON-lines response from the embed daemon.
type Response struct {
	ID      string      `json:"id"`
	Vectors [][]float64 `json:"vectors,omitempty"`
	Status  string      `json:"status,omitempty"`
	Model   string      `json:"model,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// IsError returns true if the response contains an error.
func (r *Response) IsError() bool {
	return r.Error != ""
}

// EncodeLine marshals a request to a JSON line (with trailing newline).
func EncodeLine(req Request) ([]byte, error) {
	data, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	data = append(data, '\n')
	return data, nil
}

// DecodeLine unmarshals a JSON line into a Response.
func DecodeLine(line []byte) (*Response, error) {
	var resp Response
	if err := json.Unmarshal(line, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}
