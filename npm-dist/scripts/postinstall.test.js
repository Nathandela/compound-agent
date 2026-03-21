#!/usr/bin/env node

// Unit tests for postinstall platform detection logic.
// Run: node scripts/postinstall.test.js

const os = require("os");
const assert = require("assert");

const PLATFORM_MAP = {
  darwin: "darwin",
  linux: "linux",
};

const ARCH_MAP = {
  x64: "amd64",
  arm64: "arm64",
};

function getPlatformKey(platform, arch) {
  const p = PLATFORM_MAP[platform];
  const a = ARCH_MAP[arch];
  if (!p || !a) return null;
  return `${p}-${a}`;
}

// Test valid platforms
assert.strictEqual(getPlatformKey("darwin", "arm64"), "darwin-arm64");
assert.strictEqual(getPlatformKey("darwin", "x64"), "darwin-amd64");
assert.strictEqual(getPlatformKey("linux", "arm64"), "linux-arm64");
assert.strictEqual(getPlatformKey("linux", "x64"), "linux-amd64");

// Test unsupported platforms
assert.strictEqual(getPlatformKey("win32", "x64"), null);
assert.strictEqual(getPlatformKey("darwin", "ia32"), null);
assert.strictEqual(getPlatformKey("freebsd", "arm64"), null);

// Test current platform resolves
const current = getPlatformKey(os.platform(), os.arch());
if (os.platform() === "darwin" || os.platform() === "linux") {
  assert.ok(current, `Current platform should resolve: ${os.platform()}-${os.arch()}`);
}

console.log("All postinstall tests passed");
