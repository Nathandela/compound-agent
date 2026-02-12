/**
 * Standardized CLI error/warning/info format helpers.
 *
 * Format:
 *   ERROR [command] CODE: message — remediation
 *   WARN [command] CODE: message — suggestion
 *   INFO [command]: message
 */

/**
 * Format an error message with command, code, message, and remediation.
 *
 * @param command - CLI command name (e.g., "search", "learn")
 * @param code - Error code (e.g., "INVALID_LIMIT", "FILE_NOT_FOUND")
 * @param message - Human-readable error description
 * @param remediation - How to fix the error
 * @returns Formatted error string
 */
export function formatError(command: string, code: string, message: string, remediation: string): string {
  return `ERROR [${command}] ${code}: ${message} \u2014 ${remediation}`;
}

/**
 * Format a warning message with command, code, message, and optional suggestion.
 *
 * @param command - CLI command name
 * @param code - Warning code
 * @param message - Human-readable warning description
 * @param suggestion - Optional suggestion for resolution
 * @returns Formatted warning string
 */
export function formatWarn(command: string, code: string, message: string, suggestion?: string): string {
  const base = `WARN [${command}] ${code}: ${message}`;
  return suggestion ? `${base} \u2014 ${suggestion}` : base;
}

/**
 * Format an informational message with command and message.
 *
 * @param command - CLI command name
 * @param message - Human-readable info message
 * @returns Formatted info string
 */
export function formatInfo(command: string, message: string): string {
  return `INFO [${command}]: ${message}`;
}
