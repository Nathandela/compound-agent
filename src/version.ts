/**
 * Package version - lightweight module to avoid circular dependency chains.
 */

import { createRequire } from 'node:module';

const _require = createRequire(import.meta.url);
const _pkg = _require('../package.json') as { version: string };

export const VERSION: string = _pkg.version;
