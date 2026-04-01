DIST      := dist
VERSION   := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT    := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
LDFLAGS   := -s -w -X github.com/nathandelacretaz/compound-agent/internal/build.Version=$(VERSION) \
             -X github.com/nathandelacretaz/compound-agent/internal/build.Commit=$(COMMIT)
RUST_DIR  := ../rust/embed-daemon

PLATFORMS := darwin-arm64 darwin-amd64 linux-arm64 linux-amd64 windows-amd64 windows-arm64

.PHONY: build build-release build-all build-daemon build-daemon-all test test-integration lint clean

# Build for local platform (development).
build:
	go build -o ca ./cmd/ca

# Build for local platform with version injection and stripped symbols.
build-release:
	go build -ldflags '$(LDFLAGS)' -o $(DIST)/ca ./cmd/ca

# Cross-compile Go binary for all platforms.
# Pure Go (CGO_ENABLED=0) — no C cross-compiler needed.
build-all: $(DIST)
	@for platform in $(PLATFORMS); do \
		os=$${platform%%-*}; \
		arch=$${platform##*-}; \
		ext=""; \
		if [ "$$os" = "windows" ]; then ext=".exe"; fi; \
		echo "Building ca-$${platform}$${ext}..."; \
		CGO_ENABLED=0 GOOS=$$os GOARCH=$$arch \
			go build -ldflags '$(LDFLAGS)' \
			-o $(DIST)/ca-$$platform$$ext ./cmd/ca || exit 1; \
	done

# Build Rust embed-daemon for local platform.
build-daemon:
	cd $(RUST_DIR) && cargo build --release
	@mkdir -p $(DIST)
	cp $(RUST_DIR)/target/release/ca-embed $(DIST)/ca-embed

# Cross-compile Rust embed-daemon for all platforms.
# Requires rustup target add for each target triple.
build-daemon-all: $(DIST)
	@for platform in $(PLATFORMS); do \
		case $$platform in \
			windows-*) continue ;; \
			darwin-arm64) triple="aarch64-apple-darwin" ;; \
			darwin-amd64) triple="x86_64-apple-darwin" ;; \
			linux-arm64)  triple="aarch64-unknown-linux-gnu" ;; \
			linux-amd64)  triple="x86_64-unknown-linux-gnu" ;; \
		esac; \
		echo "Building embed-daemon-$$platform ($$triple)..."; \
		cd $(RUST_DIR) && cargo build --release --target $$triple || exit 1; \
		cp $(RUST_DIR)/target/$$triple/release/ca-embed $(DIST)/ca-embed-$$platform; \
	done

test:
	go test ./...

test-integration:
	go test -tags integration ./...

lint:
	go vet ./...

clean:
	rm -rf $(DIST) ca
	rm -rf $(RUST_DIR)/target

$(DIST):
	@mkdir -p $(DIST)
