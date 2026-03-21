TAGS := sqlite_fts5

.PHONY: build test lint clean

build:
	go build -tags "$(TAGS)" ./cmd/ca

test:
	go test -tags "$(TAGS)" ./...

lint:
	go vet -tags "$(TAGS)" ./...

clean:
	rm -f ca
