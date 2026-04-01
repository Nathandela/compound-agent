#!/usr/bin/env node

// Downloads platform-specific binaries (ca + ca-embed) from GitHub Releases.
// Uses Node.js platform detection (NOT Go's runtime.GOARCH) to handle
// Rosetta/emulation correctly on Apple Silicon.
//
// Exports getPlatformKey, verifyChecksum, shouldSkipDownload for testability.

const https = require("https");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { createHash } = require("crypto");

const PLATFORM_MAP = { darwin: "darwin", linux: "linux", win32: "windows" };
const ARCH_MAP = { x64: "amd64", arm64: "arm64" };
const REPO = "Nathandela/compound-agent";

function getPlatformKey(platform, arch) {
  const p = PLATFORM_MAP[platform];
  const a = ARCH_MAP[arch];
  if (!p || !a) {
    throw new Error(
      `Unsupported platform: ${platform}-${arch}. Supported: darwin-amd64, darwin-arm64, linux-amd64, linux-arm64, windows-amd64, windows-arm64`
    );
  }
  return `${p}-${a}`;
}

function verifyChecksum(filePath, artifactName, checksumsPath) {
  const checksums = fs.readFileSync(checksumsPath, "utf-8");
  const lines = checksums.trim().split("\n");

  let expectedHash = null;
  for (const line of lines) {
    // GoReleaser format: <sha256>  <filename>
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2 && parts[1] === artifactName) {
      expectedHash = parts[0];
      break;
    }
  }

  if (!expectedHash) {
    throw new Error(`${artifactName} not found in checksums.txt`);
  }

  const fileData = fs.readFileSync(filePath);
  const actualHash = createHash("sha256").update(fileData).digest("hex");
  return actualHash === expectedHash;
}

function shouldSkipDownload(binDir, expectedVersion) {
  const isWindows = require("os").platform() === "win32";
  const caPath = path.join(binDir, isWindows ? "ca-binary.exe" : "ca-binary");
  const embedPath = path.join(binDir, "ca-embed");

  if (!fs.existsSync(caPath)) return false;
  // ca-embed is not available on Windows — only require it on Unix
  if (!isWindows && !fs.existsSync(embedPath)) return false;

  try {
    const output = execFileSync(caPath, ["version"], { stdio: "pipe", encoding: "utf-8" });
    // Verify version matches to prevent stale binaries after upgrade
    if (expectedVersion && !output.includes(expectedVersion)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl, redirects) => {
      if (redirects > 5) {
        reject(new Error("Too many redirects"));
        return;
      }

      // P0-2 fix: validate redirect URLs stay on HTTPS
      if (!currentUrl.startsWith("https://")) {
        reject(new Error(`Refusing non-HTTPS redirect: ${currentUrl}`));
        return;
      }

      https
        .get(currentUrl, { timeout: 60000 }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            follow(res.headers.location, redirects + 1);
            return;
          }

          if (res.statusCode !== 200) {
            res.resume(); // Drain response to free the socket
            reject(new Error(`Download failed: HTTP ${res.statusCode} from ${currentUrl}`));
            return;
          }

          const file = fs.createWriteStream(dest);
          res.pipe(file);
          file.on("finish", () => file.close());
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
        .on("timeout", () => {
          reject(new Error(`Download timed out: ${currentUrl}`));
        })
        .on("error", reject);
    };

    follow(url, 0);
  });
}

// P1-3 fix: download to .tmp name, rename after checksum verification
async function downloadBinary(binDir, url, destName, label) {
  const tmpPath = path.join(binDir, destName + ".tmp");

  await downloadFile(url, tmpPath);

  const stats = fs.statSync(tmpPath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`[compound-agent] ${label}: ${sizeMB} MB`);
}

function cleanupBinaries(binDir) {
  for (const name of [
    "ca-binary", "ca-binary.tmp", "ca-binary.exe", "ca-binary.exe.tmp",
    "ca-embed", "ca-embed.tmp", "checksums.txt",
  ]) {
    try { fs.unlinkSync(path.join(binDir, name)); } catch { /* ignore */ }
  }
}

function platformPackageInstalled() {
  const platform = require("os").platform();
  const pkg = `@syottos/${platform}-${require("os").arch()}`;
  const ext = platform === "win32" ? ".exe" : "";
  try {
    const pkgDir = path.dirname(require.resolve(`${pkg}/package.json`));
    return fs.existsSync(path.join(pkgDir, "bin", `ca${ext}`));
  } catch {
    return false;
  }
}

async function main() {
  // Skip self-install (when running pnpm install inside compound-agent itself)
  if (process.env.npm_package_name === "compound-agent") return;

  // Skip if platform-specific package already provides the binary
  if (platformPackageInstalled()) {
    console.log("[compound-agent] Binary provided by platform package, skipping download");
    return;
  }

  const platformKey = getPlatformKey(
    require("os").platform(),
    require("os").arch()
  );

  const pkg = require("../package.json");
  const version = pkg.version;

  const binDir = path.resolve(__dirname, "../bin");

  if (shouldSkipDownload(binDir, version)) {
    console.log("[compound-agent] Binaries already installed, skipping download");
    return;
  }

  console.log(`[compound-agent] Platform: ${platformKey}`);
  console.log(`[compound-agent] Downloading: v${version}`);

  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  const baseUrl = `https://github.com/${REPO}/releases/download/v${version}`;

  try {
    // Download checksums first
    const checksumsPath = path.join(binDir, "checksums.txt");
    await downloadFile(`${baseUrl}/checksums.txt`, checksumsPath);

    // Download binaries in parallel (to .tmp names)
    const isWindows = require("os").platform() === "win32";
    const caExt = isWindows ? ".exe" : "";
    const caArtifact = `ca-${platformKey}${caExt}`;

    const downloads = [
      downloadBinary(binDir, `${baseUrl}/${caArtifact}`, `ca-binary${caExt}`, "CLI binary"),
    ];

    // ca-embed is not available on Windows
    let embedArtifact = null;
    if (!isWindows) {
      // No x86_64 macOS embed build (ort-sys limitation) — use arm64 via Rosetta
      const embedKey = platformKey === "darwin-amd64" ? "darwin-arm64" : platformKey;
      embedArtifact = `ca-embed-${embedKey}`;
      downloads.push(
        downloadBinary(binDir, `${baseUrl}/${embedArtifact}`, "ca-embed", "Embed daemon"),
      );
    }

    await Promise.all(downloads);

    // Verify checksums against .tmp files
    const caOk = verifyChecksum(path.join(binDir, `ca-binary${caExt}.tmp`), caArtifact, checksumsPath);
    let embedOk = true;
    if (embedArtifact) {
      embedOk = verifyChecksum(path.join(binDir, "ca-embed.tmp"), embedArtifact, checksumsPath);
    }

    if (!caOk || !embedOk) {
      const failed = [];
      if (!caOk) failed.push("ca");
      if (!embedOk) failed.push("ca-embed");
      // P1-4 fix: clean up bad binaries before throwing
      cleanupBinaries(binDir);
      throw new Error(`Checksum verification failed for: ${failed.join(", ")}`);
    }

    console.log("[compound-agent] Checksums verified");

    // Checksums passed — rename .tmp to final names and set executable
    const caFinal = path.join(binDir, `ca-binary${caExt}`);
    fs.renameSync(path.join(binDir, `ca-binary${caExt}.tmp`), caFinal);
    fs.chmodSync(caFinal, 0o755);
    if (embedArtifact) {
      fs.renameSync(path.join(binDir, "ca-embed.tmp"), path.join(binDir, "ca-embed"));
      fs.chmodSync(path.join(binDir, "ca-embed"), 0o755);
    }

    // Functional verification (P1-2 fix: use execFileSync)
    try {
      execFileSync(caFinal, ["version"], { stdio: "pipe" });
      console.log("[compound-agent] Functional check passed");
    } catch {
      cleanupBinaries(binDir);
      throw new Error("Binary downloaded but functional check failed (ca version exited non-zero)");
    }
  } catch (err) {
    // Non-fatal: the bin/ca wrapper will retry via lazy download on first run.
    // Exiting 0 so npm/pnpm install doesn't fail.
    console.warn(`[compound-agent] Postinstall download failed: ${err.message}`);
    console.warn("[compound-agent] The binary will be downloaded on first use.");
    console.warn(`[compound-agent] Or manually download from: https://github.com/${REPO}/releases/tag/v${version}`);
  }
}

// Export for testing
module.exports = { getPlatformKey, verifyChecksum, shouldSkipDownload };

// Run main only when executed directly (not when required for testing)
if (require.main === module) {
  main();
}
