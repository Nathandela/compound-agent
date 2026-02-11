/**
 * Shared types for setup commands.
 */

/** Result of Claude hooks installation attempt */
export interface ClaudeHooksResult {
  /** Whether hooks are now installed */
  installed: boolean;
  /** Action taken: 'installed', 'already_installed', 'error' */
  action: 'installed' | 'already_installed' | 'error';
  /** Error message if action is 'error' */
  error?: string;
}
