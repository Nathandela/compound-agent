/**
 * Test-only helpers for SQLite module.
 *
 * These functions manipulate internal state for testing purposes
 * (e.g., simulating SQLite unavailability). They must NOT be
 * imported by production code.
 *
 * @internal Test-only API
 */

export { _resetSqliteState, _setForceUnavailable } from './availability.js';
