/**
 * Lint utilities — detect which linter a repository uses by scanning for config files.
 */

export { detectLinter, LinterInfoSchema, LinterNameSchema } from './detect.js';
export type { LinterInfo, LinterName } from './detect.js';
