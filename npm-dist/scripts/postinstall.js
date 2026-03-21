#!/usr/bin/env node

// Downloads the correct platform-specific binary from GitHub Releases.
// Uses Node.js platform detection (NOT Go's runtime.GOARCH) to handle
// Rosetta/emulation correctly on Apple Silicon.

const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

const PLATFORM_MAP = {
  darwin: "darwin",
  linux: "linux",
};

const ARCH_MAP = {
  x64: "amd64",
  arm64: "arm64",
};

const REPO = "Nathandela/compound-agent";

function getPlatformKey() {
  const platform = PLATFORM_MAP[os.platform()];
  const arch = ARCH_MAP[os.arch()];

  if (!platform || !arch) {
    console.error(
      `[compound-agent] Unsupported platform: ${os.platform()}-${os.arch()}`
    );
    console.error(
      "[compound-agent] Supported: darwin-amd64, darwin-arm64, linux-amd64, linux-arm64"
    );
    process.exit(1);
  }

  return `${platform}-${arch}`;
}

function getVersion() {
  const pkg = require("../package.json");
  return pkg.version;
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (url, redirects) => {
      if (redirects > 5) {
        reject(new Error("Too many redirects"));
        return;
      }

      https
        .get(url, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            follow(res.headers.location, redirects + 1);
            return;
          }

          if (res.statusCode !== 200) {
            reject(new Error(`Download failed: HTTP ${res.statusCode} from ${url}`));
            return;
          }

          const file = fs.createWriteStream(dest);
          res.pipe(file);
          file.on("close", resolve);
          file.on("error", (err) => {
            fs.unlink(dest, () => {});
            reject(err);
          });
          res.on("error", (err) => {
            file.destroy();
            fs.unlink(dest, () => {});
            reject(err);
          });
        })
        .on("error", reject);
    };

    follow(url, 0);
  });
}

async function downloadBinary(binDir, url, destName, label) {
  const destPath = path.join(binDir, destName);

  try {
    await downloadFile(url, destPath);
    fs.chmodSync(destPath, 0o755);

    const stats = fs.statSync(destPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`[compound-agent] ${label}: ${sizeMB} MB`);
  } catch (err) {
    console.error(`[compound-agent] ${label} download failed: ${err.message}`);
    console.error(`[compound-agent] URL: ${url}`);
    throw err;
  }
}

async function main() {
  const platformKey = getPlatformKey();
  const version = getVersion();

  const binDir = path.resolve(__dirname, "../bin");
  const caPath = path.join(binDir, "ca-binary");
  const embedPath = path.join(binDir, "ca-embed");

  // Check if both binaries already exist and work
  if (fs.existsSync(caPath) && fs.existsSync(embedPath)) {
    try {
      execSync(`"${caPath}" version`, { stdio: "pipe" });
      console.log("[compound-agent] Binaries already installed, skipping download");
      return;
    } catch {
      // Binary exists but doesn't work, re-download
    }
  }

  console.log(`[compound-agent] Platform: ${platformKey}`);
  console.log(`[compound-agent] Downloading: v${version}`);

  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  const baseUrl = `https://github.com/${REPO}/releases/download/v${version}`;

  try {
    await Promise.all([
      downloadBinary(binDir, `${baseUrl}/ca-${platformKey}`, "ca-binary", "CLI binary"),
      downloadBinary(binDir, `${baseUrl}/ca-embed-${platformKey}`, "ca-embed", "Embed daemon"),
    ]);
  } catch (err) {
    console.error(
      "[compound-agent] You can manually download binaries from:"
    );
    console.error(
      `[compound-agent]   https://github.com/${REPO}/releases/tag/v${version}`
    );
    process.exit(1);
  }
}

main();
