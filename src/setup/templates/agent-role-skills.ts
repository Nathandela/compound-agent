import { WORKFLOW_ROLE_SKILLS } from './agent-role-skills-workflow.js';
import { REVIEW_ROLE_SKILLS } from './agent-role-skills-review.js';
import { PHASE11_ROLE_SKILLS } from './agent-role-skills-phase11.js';

export const AGENT_ROLE_SKILLS: Record<string, string> = {
  ...WORKFLOW_ROLE_SKILLS,
  ...REVIEW_ROLE_SKILLS,
  ...PHASE11_ROLE_SKILLS,
};
