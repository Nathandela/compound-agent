/**
 * Structural test verifying the commands directory has been flattened.
 * The setup/ and management/ subdirectories should not exist.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const commandsDir = join(import.meta.dirname, '.');

describe('Commands directory structure is flat', () => {
  it('setup/ subdirectory does not exist', () => {
    expect(existsSync(join(commandsDir, 'setup'))).toBe(false);
  });

  it('management/ subdirectory does not exist', () => {
    expect(existsSync(join(commandsDir, 'management'))).toBe(false);
  });

  it('setup barrel file does not exist', () => {
    expect(existsSync(join(commandsDir, 'setup', 'index.ts'))).toBe(false);
  });

  it('management barrel file does not exist', () => {
    expect(existsSync(join(commandsDir, 'management', 'index.ts'))).toBe(false);
  });
});
