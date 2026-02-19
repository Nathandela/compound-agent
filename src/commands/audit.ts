/**
 * Audit command: ca audit
 *
 * Runs all audit checks and outputs findings.
 */

import chalk from 'chalk';
import type { Command } from 'commander';

import { getRepoRoot } from '../cli-utils.js';
import { formatError } from '../cli-error-format.js';
import { runAudit } from '../audit/index.js';
import type { AuditFinding } from '../audit/index.js';

import { getGlobalOpts } from './shared.js';

const JSON_INDENT = 2;

/**
 * Format a single finding as a human-readable line.
 */
function formatFinding(finding: AuditFinding): string {
  const label = finding.severity.toUpperCase();
  const filePart = finding.file ? ` ${finding.file}` : '';
  return `${label} [${finding.source}]${filePart} -- ${finding.issue}`;
}

/**
 * Register the audit command on the program.
 */
export function registerAuditCommands(program: Command): void {
  program
    .command('audit')
    .description('Run audit checks against the codebase')
    .option('--json', 'Output as JSON')
    .option('--no-rules', 'Skip rule checks')
    .option('--no-patterns', 'Skip pattern checks')
    .option('--no-lessons', 'Skip lesson checks')
    .action(async function (this: Command) {
      const repoRoot = getRepoRoot();
      const { quiet } = getGlobalOpts(this);
      const opts = this.opts<{ json?: boolean; rules: boolean; patterns: boolean; lessons: boolean }>();

      let report;
      try {
        report = await runAudit(repoRoot, {
          includeRules: opts.rules,
          includePatterns: opts.patterns,
          includeLessons: opts.lessons,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Audit failed';
        console.error(formatError('audit', 'AUDIT_ERROR', msg, 'Check repo configuration'));
        process.exitCode = 1;
        return;
      }

      if (opts.json) {
        console.log(JSON.stringify(report, null, JSON_INDENT));
      } else {
        for (const finding of report.findings) {
          const line = formatFinding(finding);
          switch (finding.severity) {
            case 'error':
              console.log(chalk.red(line));
              break;
            case 'warning':
              console.log(chalk.yellow(line));
              break;
            default:
              console.log(chalk.blue(line));
              break;
          }
        }

        if (!quiet) {
          console.log('');
          console.log(
            `Audit: ${report.findings.length} finding(s), ` +
              `${report.summary.errors} error(s), ` +
              `${report.summary.warnings} warning(s), ` +
              `${report.summary.infos} info(s)`
          );
        }
      }

      if (report.summary.errors > 0) {
        process.exitCode = 1;
      }
    });
}
