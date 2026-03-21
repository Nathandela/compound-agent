package embed

import (
	"encoding/json"
	"testing"
)

func TestRequestMarshal_Embed(t *testing.T) {
	req := Request{
		ID:     "test-1",
		Method: "embed",
		Texts:  []string{"hello world", "test text"},
	}
	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var decoded map[string]interface{}
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if decoded["method"] != "embed" {
		t.Errorf("method = %v, want embed", decoded["method"])
	}
	if decoded["id"] != "test-1" {
		t.Errorf("id = %v, want test-1", decoded["id"])
	}
	texts := decoded["texts"].([]interface{})
	if len(texts) != 2 {
		t.Errorf("texts len = %d, want 2", len(texts))
	}
}

func TestRequestMarshal_Health(t *testing.T) {
	req := Request{
		ID:     "h-1",
		Method: "health",
	}
	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	// texts should be omitted when nil
	var decoded map[string]interface{}
	json.Unmarshal(data, &decoded)
	if _, ok := decoded["texts"]; ok {
		t.Error("texts should be omitted for health request")
	}
}

func TestRequestMarshal_Shutdown(t *testing.T) {
	req := Request{
		ID:     "s-1",
		Method: "shutdown",
	}
	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var decoded map[string]interface{}
	json.Unmarshal(data, &decoded)
	if decoded["method"] != "shutdown" {
		t.Errorf("method = %v, want shutdown", decoded["method"])
	}
}

func TestResponseUnmarshal_Embed(t *testing.T) {
	raw := `{"id":"r-1","vectors":[[0.1,0.2,0.3],[0.4,0.5,0.6]]}`
	var resp Response
	if err := json.Unmarshal([]byte(raw), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.ID != "r-1" {
		t.Errorf("id = %v, want r-1", resp.ID)
	}
	if len(resp.Vectors) != 2 {
		t.Fatalf("vectors len = %d, want 2", len(resp.Vectors))
	}
	if resp.Vectors[0][0] != 0.1 {
		t.Errorf("vectors[0][0] = %f, want 0.1", resp.Vectors[0][0])
	}
}

func TestResponseUnmarshal_Health(t *testing.T) {
	raw := `{"id":"h-1","status":"ok","model":"nomic-embed-text-v1.5"}`
	var resp Response
	if err := json.Unmarshal([]byte(raw), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Status != "ok" {
		t.Errorf("status = %v, want ok", resp.Status)
	}
	if resp.Model != "nomic-embed-text-v1.5" {
		t.Errorf("model = %v, want nomic-embed-text-v1.5", resp.Model)
	}
}

func TestResponseUnmarshal_Error(t *testing.T) {
	raw := `{"id":"e-1","error":"parse: invalid json"}`
	var resp Response
	if err := json.Unmarshal([]byte(raw), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Error != "parse: invalid json" {
		t.Errorf("error = %v, want parse: invalid json", resp.Error)
	}
}

func TestResponseUnmarshal_Shutdown(t *testing.T) {
	raw := `{"id":"s-1","status":"shutting_down"}`
	var resp Response
	if err := json.Unmarshal([]byte(raw), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Status != "shutting_down" {
		t.Errorf("status = %v, want shutting_down", resp.Status)
	}
}

func TestEncodeLine(t *testing.T) {
	req := Request{ID: "t-1", Method: "health"}
	data, err := EncodeLine(req)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	// Must end with newline
	if data[len(data)-1] != '\n' {
		t.Error("encoded line must end with newline")
	}
	// Must be valid JSON before newline
	var decoded Request
	if err := json.Unmarshal(data[:len(data)-1], &decoded); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if decoded.Method != "health" {
		t.Errorf("method = %v, want health", decoded.Method)
	}
}

func TestDecodeLine(t *testing.T) {
	line := `{"id":"t-1","status":"ok","model":"nomic-embed-text-v1.5"}` + "\n"
	resp, err := DecodeLine([]byte(line))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Status != "ok" {
		t.Errorf("status = %v, want ok", resp.Status)
	}
}

func TestDecodeLine_InvalidJSON(t *testing.T) {
	_, err := DecodeLine([]byte("not json\n"))
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestResponse_IsError(t *testing.T) {
	cases := []struct {
		name    string
		resp    Response
		wantErr bool
	}{
		{"no error", Response{ID: "1", Status: "ok"}, false},
		{"with error", Response{ID: "1", Error: "bad"}, true},
		{"empty error", Response{ID: "1", Error: ""}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := tc.resp.IsError()
			if got != tc.wantErr {
				t.Errorf("IsError() = %v, want %v", got, tc.wantErr)
			}
		})
	}
}
