export {
  readConfig,
  writeConfig,
  getExternalReviewers,
  enableReviewer,
  disableReviewer,
  CONFIG_FILENAME,
  VALID_REVIEWERS,
  VALID_LOOP_REVIEWERS,
} from './config.js';

export type { CompoundAgentConfig, ReviewerName, LoopReviewerName } from './config.js';
