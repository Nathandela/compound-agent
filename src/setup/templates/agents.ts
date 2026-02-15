/**
 * Agent definition templates for .claude/agents/compound/.
 * Each entry is a markdown file that Claude Code discovers as a spawnable agent.
 *
 * Templates are split across multiple files to stay within the 400-line limit:
 * - agents-review.ts: Research + review agents (7 templates)
 * - agents-workflow.ts: Compound phase + TDD work agents (6 templates)
 * - agents-phase11.ts: Phase 11 intelligent compounding agents (5 templates)
 */

import { EXTERNAL_AGENT_TEMPLATES } from './agents-external.js';
import { PHASE11_AGENT_TEMPLATES } from './agents-phase11.js';
import { REVIEW_AGENT_TEMPLATES } from './agents-review.js';
import { WORKFLOW_AGENT_TEMPLATES } from './agents-workflow.js';

export const AGENT_TEMPLATES: Record<string, string> = {
  ...REVIEW_AGENT_TEMPLATES,
  ...WORKFLOW_AGENT_TEMPLATES,
  ...PHASE11_AGENT_TEMPLATES,
  ...EXTERNAL_AGENT_TEMPLATES,
};
