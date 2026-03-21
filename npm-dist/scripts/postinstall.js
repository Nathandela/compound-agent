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
          file.on("finish", () => {
            file.close();
            resolve();
          });
          file.on("error", reject);
        })
        .on("error", reject);
    };

    follow(url, 0);
  });
}

async function main() {
  const platformKey = getPlatformKey();
  const version = getVersion();
  const binaryName = `ca-${platformKey}`;

  const binDir = path.resolve(__dirname, "../bin");
  const destPath = path.join(binDir, "ca-binary");

  // Check if binary already exists (e.g., from manual install)
  if (fs.existsSync(destPath)) {
    try {
      execSync(`"${destPath}" version`, { stdio: "pipe" });
      console.log("[compound-agent] Binary already installed, skipping download");
      return;
    } catch {
      // Binary exists but doesn't work, re-download
    }
  }

  const releaseUrl = `https://github.com/${REPO}/releases/download/v${version}/${binaryName}`;

  console.log(`[compound-agent] Platform: ${platformKey}`);
  console.log(`[compound-agent] Downloading: v${version}`);

  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  try {
    await downloadFile(releaseUrl, destPath);
    fs.chmodSync(destPath, 0o755);

    const stats = fs.statSync(destPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`[compound-agent] Installed: ${sizeMB} MB`);
  } catch (err) {
    console.error(`[compound-agent] Download failed: ${err.message}`);
    console.error(`[compound-agent] URL: ${releaseUrl}`);
    console.error(
      "[compound-agent] You can manually download the binary from:"
    );
    console.error(
      `[compound-agent]   https://github.com/${REPO}/releases/tag/v${version}`
    );
    process.exit(1);
  }
}

main();
