/**
 * Rules command: rules check
 *
 * Runs repository-defined rules from .claude/rules.json and outputs
 * agent-legible violation messages.
 */

import chalk from 'chalk';
import type { Command } from 'commander';

import { getRepoRoot } from '../cli-utils.js';
import { formatViolation, loadRuleConfig, runRules } from '../rules/index.js';

import { getGlobalOpts, out } from './shared.js';

/**
 * Register the rules command group on the program.
 */
export function registerRulesCommands(program: Command): void {
  const rulesCmd = program
    .command('rules')
    .description('Run repository-defined rule checks');

  rulesCmd
    .command('check')
    .description('Check codebase against rules in .claude/rules.json')
    .action(function (this: Command) {
      const repoRoot = getRepoRoot();
      const { quiet } = getGlobalOpts(this);

      let config;
      try {
        config = loadRuleConfig(repoRoot);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load rules config';
        out.error(msg);
        process.exit(1);
      }

      if (config.rules.length === 0) {
        if (!quiet) {
          out.info('No rules defined. Create .claude/rules.json to add rules.');
        }
        return;
      }

      const results = runRules(repoRoot, config.rules);

      // Print violations
      for (const result of results) {
        for (const violation of result.violations) {
          const line = formatViolation(result.rule, violation);
          switch (result.rule.severity) {
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
      }

      // Summary
      const total = results.length;
      const errors = results.filter((r) => !r.passed && r.rule.severity === 'error').length;
      const warnings = results.filter((r) => !r.passed && r.rule.severity === 'warning').length;
      const passed = results.filter((r) => r.passed).length;

      console.log('');
      console.log(`Rules: ${total} checked, ${errors} error(s), ${warnings} warning(s), ${passed} passed`);

      if (errors > 0) {
        process.exit(1);
      }
    });
}
