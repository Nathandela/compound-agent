#!/usr/bin/env node

// Creates and publishes platform-specific npm packages from release binaries.
// Called by the release workflow after GoReleaser creates the GitHub release.
//
// Expected directory layout (created by the workflow):
//   release-bins/
//     ca-darwin-amd64
//     ca-darwin-arm64
//     ca-linux-amd64
//     ca-linux-arm64
//     ca-embed-darwin-amd64
//     ca-embed-darwin-arm64
//     ca-embed-linux-amd64
//     ca-embed-linux-arm64

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

// Maps npm platform names to GoReleaser artifact names.
// npm uses "x64", GoReleaser uses "amd64".
const PLATFORMS = [
  { npm: "darwin-arm64", goreleaser: "darwin-arm64", os: "darwin", cpu: "arm64" },
  { npm: "darwin-x64",   goreleaser: "darwin-amd64", os: "darwin", cpu: "x64" },
  { npm: "linux-arm64",  goreleaser: "linux-arm64",  os: "linux",  cpu: "arm64" },
  { npm: "linux-x64",    goreleaser: "linux-amd64",  os: "linux",  cpu: "x64" },
];

function main() {
  const pkg = require("../package.json");
  const version = pkg.version;
  const binDir = path.resolve(__dirname, "..", "release-bins");

  if (!fs.existsSync(binDir)) {
    console.error(`[publish-platforms] release-bins/ not found at ${binDir}`);
    process.exit(1);
  }

  for (const platform of PLATFORMS) {
    const pkgName = `@syottos/${platform.npm}`;
    console.log(`\n[publish-platforms] Publishing ${pkgName}@${version}`);

    const tmpDir = path.resolve(__dirname, "..", `npm-tmp-${platform.npm}`);
    try {
      const tmpBin = path.join(tmpDir, "bin");
      fs.mkdirSync(tmpBin, { recursive: true });

      // Copy and rename binaries
      const caSrc = path.join(binDir, `ca-${platform.goreleaser}`);
      const embedSrc = path.join(binDir, `ca-embed-${platform.goreleaser}`);

      if (!fs.existsSync(caSrc)) {
        console.error(`[publish-platforms] Missing: ${caSrc}`);
        process.exit(1);
      }
      if (!fs.existsSync(embedSrc)) {
        console.error(`[publish-platforms] Missing: ${embedSrc}`);
        process.exit(1);
      }

      fs.copyFileSync(caSrc, path.join(tmpBin, "ca"));
      fs.copyFileSync(embedSrc, path.join(tmpBin, "ca-embed"));
      fs.chmodSync(path.join(tmpBin, "ca"), 0o755);
      fs.chmodSync(path.join(tmpBin, "ca-embed"), 0o755);

      // Write package.json
      const platformPkg = {
        name: pkgName,
        version: version,
        description: `Platform-specific binaries for compound-agent (${platform.npm})`,
        os: [platform.os],
        cpu: [platform.cpu],
        files: ["bin/"],
        license: "MIT",
        engines: pkg.engines,
        repository: pkg.repository,
        author: pkg.author,
      };
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify(platformPkg, null, 2) + "\n"
      );

      fs.writeFileSync(
        path.join(tmpDir, "README.md"),
        `# ${pkgName}\n\nPlatform-specific binaries for [compound-agent](https://github.com/Nathandela/compound-agent). Do not install directly — use \`compound-agent\` instead.\n`
      );

      // Publish
      execFileSync("npm", ["publish", "--access", "public", "--provenance"], {
        cwd: tmpDir,
        stdio: "inherit",
      });
      console.log(`[publish-platforms] Published ${pkgName}@${version}`);
    } catch (err) {
      // Handle "already published" (idempotent re-runs)
      if (err.stderr && err.stderr.toString().includes("Cannot publish over previously published version")) {
        console.log(`[publish-platforms] ${pkgName}@${version} already published, skipping`);
        continue;
      }
      // execFileSync puts stderr on the error object's output
      const stderr = err.output ? err.output.filter(Boolean).join("") : err.message;
      if (stderr.includes("Cannot publish over previously published version")) {
        console.log(`[publish-platforms] ${pkgName}@${version} already published, skipping`);
        continue;
      }
      console.error(`[publish-platforms] Failed to publish ${pkgName}: ${err.message}`);
      process.exit(1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  console.log("\n[publish-platforms] All platform packages published.");
}

main();
