/**
 * Abortable stdin reader with proper cleanup.
 *
 * Unlike naive Promise.race + for-await, this destroys the stream
 * on timeout/completion so the event loop can drain.
 */

/**
 * Options for readStdin.
 */
export interface ReadStdinOptions {
  /** Read timeout in milliseconds. Default: 30_000 (30 seconds). */
  timeoutMs?: number;
  /** Maximum bytes to accept. Default: 1_048_576 (1 MB). */
  maxBytes?: number;
}

/** Default timeout: 30 seconds. */
const DEFAULT_TIMEOUT_MS = 30_000;
/** Default max stdin size: 1 MB. */
const DEFAULT_MAX_BYTES = 1_048_576;

/**
 * Read stdin as a UTF-8 string with timeout and size-limit protection.
 *
 * Uses event listeners (NOT `for await`) so the stream can be properly
 * cleaned up on timeout, size-limit breach, or completion. This prevents
 * the Node event loop from being held open by a dangling async iterator.
 *
 * @param options - Optional timeout and size-limit configuration.
 * @returns The stdin contents as a string.
 * @throws Error on timeout or if maxBytes is exceeded.
 */
export async function readStdin(options?: ReadStdinOptions): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;

  const { stdin } = process;

  // Fast path: if stdin is already closed/destroyed, return empty immediately.
  if (stdin.readableEnded || stdin.destroyed) {
    return '';
  }

  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    // Cleanup helper: remove our listeners, clear timer, pause/destroy stream.
    function cleanup(): void {
      clearTimeout(timerId);
      stdin.removeListener('data', onData);
      stdin.removeListener('end', onEnd);
      stdin.removeListener('error', onError);
      // Pause stdin so the event loop can drain. Only destroy if not a TTY
      // (destroying a TTY stdin would kill the terminal for the parent process).
      stdin.pause();
      if (!stdin.isTTY && !stdin.destroyed) {
        stdin.destroy();
      }
    }

    function settle(fn: () => void): void {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    }

    function onData(chunk: Buffer): void {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        settle(() => reject(new Error(`stdin exceeds ${maxBytes} byte limit`)));
        return;
      }
      chunks.push(chunk);
    }

    function onEnd(): void {
      settle(() => resolve(Buffer.concat(chunks).toString('utf-8')));
    }

    function onError(err: Error): void {
      settle(() => reject(err));
    }

    const timerId = setTimeout(() => {
      settle(() => reject(new Error('stdin read timed out')));
    }, timeoutMs);

    stdin.on('data', onData);
    stdin.on('end', onEnd);
    stdin.on('error', onError);

    // Ensure stdin is flowing (it may have been paused).
    stdin.resume();
  });
}
