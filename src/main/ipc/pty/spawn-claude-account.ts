import { withClaudeProfileTerminalEnv } from '../../claude-accounts/claude-profile-installed-router'
import type { ClaudeAccountSelectionTarget } from '../../claude-accounts/runtime-selection'
import type { ClaudeRuntimeAuthPreparation } from '../../claude-accounts/runtime-auth/runtime-auth-types'
import { isClaudeLaunchProfileEnv } from '../../../shared/claude-launch-profiles'
import type { PrepareClaudeAuth } from './host-env/types'

/** Managed account routing for a terminal spawn, unless a named launch profile already pins the account. */
export async function resolveSpawnClaudeAccount<Env extends Record<string, string> | undefined>(
  env: Env,
  target: ClaudeAccountSelectionTarget,
  isClaudeLaunch: boolean,
  prepareClaudeAuth: PrepareClaudeAuth | undefined
): Promise<{
  env: Env | Record<string, string>
  claudeAuth: ClaudeRuntimeAuthPreparation | null
}> {
  if (isClaudeLaunchProfileEnv(env)) {
    return { env, claudeAuth: null }
  }
  return {
    env: withClaudeProfileTerminalEnv(env, target),
    claudeAuth: isClaudeLaunch && prepareClaudeAuth ? await prepareClaudeAuth(target) : null
  }
}
