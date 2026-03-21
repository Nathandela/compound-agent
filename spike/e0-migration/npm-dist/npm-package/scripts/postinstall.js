#!/usr/bin/env node

// Postinstall script: copies the correct platform binary into bin/
// In production, this would download from GitHub Releases.
// For the spike, it copies from the local go-binary build output.

const fs = require("fs");
const path = require("path");
const os = require("os");

const PLATFORM_MAP = {
  darwin: "darwin",
  linux: "linux",
};

const ARCH_MAP = {
  x64: "amd64",
  arm64: "arm64",
};

function getPlatformKey() {
  const platform = PLATFORM_MAP[os.platform()];
  const arch = ARCH_MAP[os.arch()];

  if (!platform || !arch) {
    console.error(
      `Unsupported platform: ${os.platform()}-${os.arch()}`
    );
    console.error(
      "Supported: darwin-amd64, darwin-arm64, linux-amd64, linux-arm64"
    );
    process.exit(1);
  }

  return `${platform}-${arch}`;
}

function main() {
  const platformKey = getPlatformKey();
  const binaryName = `ca-spike-${platformKey}`;

  // In production: download from GitHub Releases URL
  // For spike: copy from local go-binary build output
  const goBinaryDir = path.resolve(__dirname, "../../go-binary/bin");
  const sourcePath = path.join(goBinaryDir, binaryName);

  const binDir = path.resolve(__dirname, "../bin");
  const destPath = path.join(binDir, "ca-spike-binary");

  console.log(`[ca-spike] Platform: ${platformKey}`);
  console.log(`[ca-spike] Source: ${sourcePath}`);
  console.log(`[ca-spike] Destination: ${destPath}`);

  if (!fs.existsSync(sourcePath)) {
    console.error(`[ca-spike] Binary not found: ${sourcePath}`);
    console.error(
      `[ca-spike] Build it first: cd go-binary && go build -o bin/${binaryName} .`
    );
    process.exit(1);
  }

  // Ensure bin directory exists
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  // Copy binary
  fs.copyFileSync(sourcePath, destPath);
  fs.chmodSync(destPath, 0o755);

  // Report size
  const stats = fs.statSync(destPath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`[ca-spike] Installed binary: ${sizeMB} MB`);
}

main();
