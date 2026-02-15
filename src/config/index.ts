export {
  readConfig,
  writeConfig,
  getExternalReviewers,
  enableReviewer,
  disableReviewer,
  CONFIG_FILENAME,
  VALID_REVIEWERS,
} from './config.js';

export type { CompoundAgentConfig, ReviewerName } from './config.js';
