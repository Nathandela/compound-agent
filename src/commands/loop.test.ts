/**
 * Tests for the `ca loop` command (infinity loop script generator).
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { generateLoopScript } from './loop.js';
import { setupCliTestContext } from '../test-utils.js';

describe('generateLoopScript', () => {
  it('generates valid bash with shebang', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toMatch(/^#!\/usr\/bin\/env bash/);
  });

  it('includes MAX_RETRIES from options', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('MAX_RETRIES=3');
  });

  it('includes MODEL from options', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('MODEL="claude-opus-4-6"');
  });

  it('sets EPIC_IDS when epics provided', () => {
    const script = generateLoopScript({
      epics: ['id-abc', 'id-def'],
      maxRetries: 3,
      model: 'claude-opus-4-6',
    });
    expect(script).toContain('EPIC_IDS="id-abc id-def"');
  });

  it('leaves EPIC_IDS empty when no epics', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('EPIC_IDS=""');
  });

  it('prompt includes ca load-session', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('ca load-session');
  });

  it('prompt includes bd show', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('bd show');
  });

  it('prompt includes compound:cook-it', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('compound:cook-it');
  });

  it('includes EPIC_COMPLETE marker', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('EPIC_COMPLETE');
  });

  it('includes EPIC_FAILED marker', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('EPIC_FAILED');
  });

  it('uses bd list for dynamic epic selection', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('bd list --type=epic --ready');
  });

  // JSON-first bd parsing: jq as primary, python3 as fallback
  it('uses jq as primary JSON parser', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('jq');
  });

  it('defines a parse_json helper function', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toMatch(/parse_json\s*\(\)/);
  });

  it('falls back to python3 when jq is unavailable', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    // Should still contain python3 as fallback path
    expect(script).toContain('python3');
  });

  it('does not require python3 as a hard dependency', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    // Should NOT die solely because python3 is missing -- jq is primary
    // The die message should mention jq as an alternative (i.e., "jq or python3")
    expect(script).not.toMatch(/die "python3 required/);
    expect(script).toMatch(/jq or python3/);
  });

  it('uses bd show --json for epic status check', () => {
    const script = generateLoopScript({
      epics: ['epic-1'],
      maxRetries: 1,
      model: 'claude-opus-4-6',
    });
    expect(script).toContain('bd show "$epic_id" --json');
  });

  it('uses bd list --json for dynamic epic selection', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    expect(script).toContain('bd list --type=epic --ready --json');
  });

  it('parses epic status from JSON via parse_json in explicit mode', () => {
    const script = generateLoopScript({
      epics: ['epic-1'],
      maxRetries: 1,
      model: 'claude-opus-4-6',
    });
    // parse_json should extract .status from bd show --json output
    expect(script).toMatch(/parse_json\s+['"]\.status['"]/);
  });

  it('parses epic id from JSON array using jq in dynamic mode', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    // jq path should extract .id from bd list --json array items
    expect(script).toMatch(/jq\s.*\.id/);
  });

  it('detects json parser availability at script startup', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    // Should set a variable indicating which parser to use
    expect(script).toMatch(/JSON_PARSER|HAS_JQ/);
  });

  // P0: parse_json must auto-unwrap single-element arrays (bd show --json returns [...])
  it('parse_json jq path auto-unwraps arrays before applying filter', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    // jq should conditionally unwrap arrays: if type == \"array\" then .[0] else . end
    // The \" are bash-escaped quotes inside the template output
    expect(script).toMatch(/if type\s*==\s*\\"array\\"\s*then\s*\.\[0\]\s*else\s*\.\s*end/);
  });

  it('parse_json python3 fallback auto-unwraps lists before field access', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    // python3 fallback should check isinstance(data, list) and unwrap
    expect(script).toContain('isinstance(data, list)');
  });

  // P0 behavioral: verify parse_json actually works on real array input
  it('python3 fallback extracts field from array-wrapped object', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    // Extract the python3 snippet from the generated script
    const pyMatch = script.match(/python3 -c "\n([\s\S]*?)"\n/);
    expect(pyMatch).toBeTruthy();
    const pyCode = pyMatch![1].replace(/\$filter/g, '.status');
    const result = execSync(
      `echo '[{"status":"open"}]' | python3 -c "${pyCode}"`,
      { encoding: 'utf-8', shell: '/bin/bash' },
    ).trim();
    expect(result).toBe('open');
  });

  it('python3 fallback exits cleanly on empty array input', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    const pyMatch = script.match(/python3 -c "\n([\s\S]*?)"\n/);
    expect(pyMatch).toBeTruthy();
    const pyCode = pyMatch![1].replace(/\$filter/g, '.status');
    // Must exit 0 (no crash). Without try/except, empty array causes KeyError → exit 1.
    expect(() => {
      execSync(`echo '[]' | python3 -c "${pyCode}"`, {
        encoding: 'utf-8',
        shell: '/bin/bash',
      });
    }).not.toThrow();
  });

  it('python3 fallback handles plain object input (regression)', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    const pyMatch = script.match(/python3 -c "\n([\s\S]*?)"\n/);
    expect(pyMatch).toBeTruthy();
    const pyCode = pyMatch![1].replace(/\$filter/g, '.status');
    const result = execSync(
      `echo '{"status":"closed"}' | python3 -c "${pyCode}"`,
      { encoding: 'utf-8', shell: '/bin/bash' },
    ).trim();
    expect(result).toBe('closed');
  });

  it('supports dry run mode', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('LOOP_DRY_RUN');
  });

  it('default max retries is reflected', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    expect(script).toContain('MAX_RETRIES=1');
  });

  it('includes HUMAN_REQUIRED marker in prompt', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('HUMAN_REQUIRED');
  });

  it('prompt instructs to log reason with HUMAN_REQUIRED', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('HUMAN_REQUIRED:');
  });

  it('main loop detects HUMAN_REQUIRED and skips epic', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    // Should grep for anchored HUMAN_REQUIRED in log and not retry
    expect(script).toMatch(/grep.*\^HUMAN_REQUIRED/);
  });

  it('main loop logs human-required reason to beads', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('bd update');
    expect(script).toMatch(/HUMAN_REQUIRED.*bd update|bd update.*HUMAN_REQUIRED/s);
  });

  it('tracks SKIPPED count in summary', () => {
    const script = generateLoopScript({ maxRetries: 3, model: 'claude-opus-4-6' });
    expect(script).toContain('SKIPPED');
  });

  // P0: LOOP_DRY_RUN safe expansion under set -u
  it('uses safe expansion for LOOP_DRY_RUN', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    // Must use ${VAR:-} syntax, not bare $VAR, for set -u compatibility
    expect(script).toContain('${LOOP_DRY_RUN:-}');
    // Should NOT have bare $LOOP_DRY_RUN in conditionals
    expect(script).not.toMatch(/\[ -n "\$LOOP_DRY_RUN" \]/);
  });

  // P0: Prevent reprocessing same epic forever
  it('tracks processed epics to prevent reprocessing', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    expect(script).toContain('PROCESSED');
  });

  it('skips processed epics in explicit mode', () => {
    const script = generateLoopScript({
      epics: ['epic-1'],
      maxRetries: 1,
      model: 'claude-opus-4-6',
    });
    // get_next_epic should check PROCESSED before returning epic
    expect(script).toMatch(/PROCESSED.*epic_id|epic_id.*PROCESSED/s);
  });

  it('appends epic to PROCESSED after processing', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    expect(script).toMatch(/PROCESSED=.*EPIC_ID/);
  });

  // P1: Input validation
  it('rejects NaN maxRetries', () => {
    expect(() => generateLoopScript({ maxRetries: NaN, model: 'claude-opus-4-6' }))
      .toThrow(/maxRetries/i);
  });

  it('rejects negative maxRetries', () => {
    expect(() => generateLoopScript({ maxRetries: -1, model: 'claude-opus-4-6' }))
      .toThrow(/maxRetries/i);
  });

  it('rejects epic IDs with shell metacharacters', () => {
    expect(() => generateLoopScript({
      epics: ['$(rm -rf /)'],
      maxRetries: 1,
      model: 'claude-opus-4-6',
    })).toThrow(/epic.*id/i);
  });

  it('accepts valid epic IDs with alphanumeric, hyphens, underscores', () => {
    expect(() => generateLoopScript({
      epics: ['learning_agent-jlrh', 'beads-123', 'my.epic'],
      maxRetries: 1,
      model: 'claude-opus-4-6',
    })).not.toThrow();
  });

  it('rejects model with shell metacharacters', () => {
    expect(() => generateLoopScript({
      maxRetries: 1,
      model: '"; rm -rf /; echo "',
    })).toThrow(/model/i);
  });

  it('accepts valid model names', () => {
    expect(() => generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' })).not.toThrow();
    expect(() => generateLoopScript({ maxRetries: 1, model: 'claude-sonnet-4-6' })).not.toThrow();
    expect(() => generateLoopScript({ maxRetries: 1, model: 'org/model:latest' })).not.toThrow();
  });

  // P0: macOS ships bash 3.2 which misparses case `)` inside $() as closing the subshell
  it('passes /bin/bash -n syntax check (macOS bash 3.2 compat)', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    const tmpFile = join('/tmp', `loop-syntax-${Date.now()}.sh`);
    writeFileSync(tmpFile, script);
    try {
      execSync(`/bin/bash -n "${tmpFile}"`, { encoding: 'utf-8' });
    } finally {
      try { execSync(`rm -f "${tmpFile}"`); } catch { /* cleanup best-effort */ }
    }
  });

  it('anchors EPIC_COMPLETE grep to line boundaries', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    expect(script).toContain('grep -q "^EPIC_COMPLETE$"');
  });

  it('anchors EPIC_FAILED grep to line boundaries', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    expect(script).toContain('grep -q "^EPIC_FAILED$"');
  });

  it('anchors HUMAN_REQUIRED grep to line start', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    expect(script).toContain('grep -q "^HUMAN_REQUIRED:"');
  });

  // ========================================================================
  // P0: Trace fallback for marker detection (0-byte log resilience)
  // ========================================================================

  it('defines a detect_marker function for resilient marker detection', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    expect(script).toMatch(/detect_marker\s*\(\)/);
  });

  it('detect_marker checks macro log with anchored patterns', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    expect(script).toContain('grep -q "^EPIC_COMPLETE$" "$logfile"');
  });

  it('detect_marker falls back to trace when log has no markers', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    expect(script).toContain('grep -q "EPIC_COMPLETE" "$tracefile"');
  });

  it('trace fallback uses unanchored grep for all marker types', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    expect(script).toContain('grep -q "EPIC_COMPLETE" "$tracefile"');
    expect(script).toContain('grep -q "EPIC_FAILED" "$tracefile"');
    expect(script).toContain('grep -q "HUMAN_REQUIRED:" "$tracefile"');
  });

  it('warns when macro log is empty but trace has content', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    expect(script).toMatch(/extract_text.*fail/i);
  });

  it('main loop calls detect_marker with both log sources', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    expect(script).toContain('detect_marker "$LOGFILE" "$TRACEFILE"');
  });

  // ========================================================================
  // Stream-JSON micro logging (two-scope observability)
  // ========================================================================

  it('uses --output-format stream-json for claude invocation', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    expect(script).toContain('--output-format stream-json');
  });

  it('uses --verbose flag (required by stream-json with -p)', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    expect(script).toContain('--verbose');
  });

  it('creates trace JSONL file alongside macro log', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    // Should write to a trace_<epic>-<ts>.jsonl file
    expect(script).toMatch(/TRACEFILE.*trace_/);
  });

  it('tees stream to both trace file and text extraction', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    // The stream should be split: raw JSONL to trace, extracted text to macro log
    expect(script).toContain('tee');
  });

  it('extracts text content from stream-json for macro log', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    // Should extract assistant text blocks from Claude Code stream-json format
    expect(script).toContain('select(.type == "assistant")');
    expect(script).toContain('.message.content[]?');
  });

  it('marker detection checks macro log first, with trace fallback', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    // Primary: anchored grep on logfile
    expect(script).toContain('grep -q "^EPIC_COMPLETE$" "$logfile"');
    // Fallback: unanchored grep on tracefile
    expect(script).toContain('grep -q "EPIC_COMPLETE" "$tracefile"');
  });

  it('DRY_RUN mode works with stream-json script shape', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    // Dry run should still skip the claude invocation entirely
    expect(script).toMatch(/LOOP_DRY_RUN.*DRY RUN/s);
  });

  it('writes a .latest pointer for the current trace file', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    // Should create a symlink or file pointing to the latest trace
    expect(script).toMatch(/\.latest|ln -sf/);
  });

  it('extract_text does not use dangerous || cat fallback', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    // extract_text should not fall back to cat (which would pass raw JSONL to macro log)
    expect(script).not.toMatch(/extract_text[\s\S]*?\|\| cat/);
  });

  it('.latest symlink is created before claude invocation', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    const symlinkPos = script.indexOf('ln -sf');
    const claudePos = script.indexOf('claude --dangerously-skip-permissions');
    expect(symlinkPos).toBeGreaterThan(-1);
    expect(claudePos).toBeGreaterThan(-1);
    expect(symlinkPos).toBeLessThan(claudePos);
  });

  it('LOGFILE and TRACEFILE use shared timestamp variable', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    // Should assign TS once and use $TS in both, not call $(timestamp) twice
    expect(script).toMatch(/TS=\$\(timestamp\)/);
    expect(script).toMatch(/LOGFILE.*\$TS/);
    expect(script).toMatch(/TRACEFILE.*\$TS/);
  });

  it('python3 extract_text correctly extracts text from assistant event', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    // Extract the python3 snippet from extract_text function
    const pyMatch = script.match(/extract_text\(\) \{[\s\S]*?python3 -c "\n([\s\S]*?)"\s*2>/);
    expect(pyMatch).toBeTruthy();
    const pyCode = pyMatch![1];
    const input = '{"type":"assistant","message":{"content":[{"type":"text","text":"Hello world"}]}}';
    const result = execSync(
      `echo '${input}' | python3 -c "${pyCode}"`,
      { encoding: 'utf-8', shell: '/bin/bash' },
    );
    expect(result).toBe('Hello world');
  });

  it('python3 extract_text skips non-assistant events', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    const pyMatch = script.match(/extract_text\(\) \{[\s\S]*?python3 -c "\n([\s\S]*?)"\s*2>/);
    expect(pyMatch).toBeTruthy();
    const pyCode = pyMatch![1];
    const input = '{"type":"tool_use","tool":{"name":"Bash","input":"echo hi"}}';
    const result = execSync(
      `echo '${input}' | python3 -c "${pyCode}"`,
      { encoding: 'utf-8', shell: '/bin/bash' },
    );
    expect(result.trim()).toBe('');
  });

  it('does not break &> capture -- uses pipe instead', () => {
    const script = generateLoopScript({ maxRetries: 1, model: 'claude-opus-4-6' });
    // The old &> LOGFILE pattern should be replaced by piped stream handling
    // The claude invocation should NOT use &> for output
    expect(script).not.toMatch(/claude\b[^|]*&>\s*"\$LOGFILE"/);
  });
});

describe('ca loop CLI', { tags: ['integration'] }, () => {
  const { getTempDir, runCli } = setupCliTestContext();

  it('writes script to default output path', () => {
    runCli('loop');
    const outputPath = join(getTempDir(), 'infinity-loop.sh');
    expect(existsSync(outputPath)).toBe(true);
  });

  it('writes script to custom output path', () => {
    runCli('loop -o custom.sh');
    const outputPath = join(getTempDir(), 'custom.sh');
    expect(existsSync(outputPath)).toBe(true);
  });

  it('generated script is executable', () => {
    runCli('loop');
    const outputPath = join(getTempDir(), 'infinity-loop.sh');
    const stats = statSync(outputPath);
    // Check owner execute bit (0o100)
    expect(stats.mode & 0o100).toBeTruthy();
  });

  it('refuses overwrite without --force', () => {
    const outputPath = join(getTempDir(), 'infinity-loop.sh');
    writeFileSync(outputPath, 'existing content');

    const { combined } = runCli('loop');
    expect(combined).toMatch(/exist|overwrite|force/i);
  });

  it('overwrites with --force', () => {
    const outputPath = join(getTempDir(), 'infinity-loop.sh');
    writeFileSync(outputPath, 'existing content');

    const { combined } = runCli('loop --force');
    const content = readFileSync(outputPath, 'utf-8');
    expect(content).not.toBe('existing content');
    expect(content).toMatch(/^#!\/usr\/bin\/env bash/);
  });

  it('passes epic IDs to generated script', () => {
    runCli('loop --epics abc def');
    const outputPath = join(getTempDir(), 'infinity-loop.sh');
    const content = readFileSync(outputPath, 'utf-8');
    expect(content).toContain('abc');
    expect(content).toContain('def');
  });

  // P2: Overwrite refusal should not silently succeed
  it('does not overwrite file on refusal', () => {
    const outputPath = join(getTempDir(), 'infinity-loop.sh');
    writeFileSync(outputPath, 'existing content');

    runCli('loop');
    const content = readFileSync(outputPath, 'utf-8');
    expect(content).toBe('existing content');
  });

  // P1: Invalid max-retries rejected at CLI level
  it('rejects invalid max-retries', () => {
    const { combined } = runCli('loop --max-retries abc');
    expect(combined).toMatch(/invalid|retries|integer/i);
  });

  // P1: Invalid epic IDs rejected at CLI level
  it('rejects invalid epic IDs', () => {
    const { combined } = runCli('loop --epics "$(bad)"');
    expect(combined).toMatch(/invalid|epic.*id/i);
  });
});
