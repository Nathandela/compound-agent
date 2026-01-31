/**
 * Quality filtering example for learning-agent
 *
 * Demonstrates:
 * - Using shouldPropose() to check if a lesson is worth capturing
 * - Using isNovel(), isSpecific(), isActionable() individually
 *
 * When installed as dependency, use:
 *   import { ... } from 'learning-agent';
 */

import { shouldPropose, isNovel, isSpecific, isActionable } from '../dist/index.js';

// Repository root - where .claude/lessons/ will be created
const repoRoot = process.cwd();

async function main() {
  console.log('Quality Filter Examples\n');
  console.log('='.repeat(60));

  // 1. Test specificity (fast, no DB)
  console.log('\n1. Specificity Checks (no DB required)\n');

  const specificityTests = [
    'Use Polars instead of pandas for files larger than 100MB',
    'Write better code', // Too vague
    'Be careful', // Too vague
    'Always test', // Too short and generic
    'Check authentication headers before making API calls',
    'Make sure to test', // Vague pattern
  ];

  for (const insight of specificityTests) {
    const result = isSpecific(insight);
    const status = result.specific ? 'PASS' : 'FAIL';
    console.log(`  [${status}] "${insight}"`);
    if (!result.specific) {
      console.log(`         Reason: ${result.reason}`);
    }
  }

  // 2. Test actionability (fast, no DB)
  console.log('\n2. Actionability Checks (no DB required)\n');

  const actionabilityTests = [
    'Use Polars instead of pandas for large datasets',
    'Prefer async/await over callbacks for readability',
    'The API sometimes fails', // Pure observation
    'Why does this happen?', // Question
    'Always add error handling when making network requests',
    'Run tests before committing code',
    'Authentication is important', // Observation without action
  ];

  for (const insight of actionabilityTests) {
    const result = isActionable(insight);
    const status = result.actionable ? 'PASS' : 'FAIL';
    console.log(`  [${status}] "${insight}"`);
    if (!result.actionable) {
      console.log(`         Reason: ${result.reason}`);
    }
  }

  // 3. Test novelty (requires DB lookup)
  console.log('\n3. Novelty Checks (requires DB)\n');

  const noveltyTests = [
    'Use TypeScript strict mode for better type safety',
    'Configure ESLint with recommended rules',
  ];

  for (const insight of noveltyTests) {
    const result = await isNovel(repoRoot, insight);
    const status = result.novel ? 'NOVEL' : 'DUPLICATE';
    console.log(`  [${status}] "${insight}"`);
    if (!result.novel) {
      console.log(`         Reason: ${result.reason}`);
    }
  }

  // 4. Combined check with shouldPropose()
  console.log('\n4. Combined Quality Check (shouldPropose)\n');

  const proposalTests = [
    'Use Polars instead of pandas for files larger than 100MB',
    'Write better code', // Fails specificity
    'The API is slow', // Fails actionability
    'Always add timeout when fetching external APIs',
  ];

  for (const insight of proposalTests) {
    const result = await shouldPropose(repoRoot, insight);
    const status = result.shouldPropose ? 'PROPOSE' : 'SKIP';
    console.log(`  [${status}] "${insight}"`);
    if (!result.shouldPropose) {
      console.log(`         Reason: ${result.reason}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('\nQuality filter ensures lessons are:');
  console.log('  - Specific (not vague "be careful" advice)');
  console.log('  - Actionable (tells you WHAT to do)');
  console.log('  - Novel (not a duplicate of existing lessons)');
}

main().catch(console.error);
