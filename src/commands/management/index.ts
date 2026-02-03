/**
 * Management commands module.
 *
 * Re-exports all management command registration functions
 * and provides a combined registration function.
 */

import type { Command } from 'commander';

import { registerCrudCommands } from './crud.js';
import { registerInvalidationCommands } from './invalidation.js';
import { registerIOCommands } from './io.js';
import { registerMaintenanceCommands } from './maintenance.js';
import { registerPrimeCommand } from './prime.js';

// Re-export helpers for use by other modules
export { formatLessonHuman, wasLessonDeleted } from './helpers.js';

// Export getPrimeContext for MCP server integration
export { getPrimeContext } from './prime.js';

/**
 * Register all management commands on the program.
 */
export function registerManagementCommands(program: Command): void {
  registerInvalidationCommands(program);
  registerMaintenanceCommands(program);
  registerIOCommands(program);
  registerPrimeCommand(program);
  registerCrudCommands(program);
}
