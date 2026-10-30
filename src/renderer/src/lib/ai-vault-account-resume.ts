import type { SleepingAgentLaunchConfig } from '../../../shared/agent-session-resume'
import { CLAUDE_LAUNCH_PROFILE_ENV } from '../../../shared/claude-launch-profiles'
import { parseExecutionHostId } from '../../../shared/execution-host'
import { parseWslUncPath } from '../../../shared/wsl-paths'
import type { AiVaultResumeCommandSession } from '../../../shared/ai-vault-resume-startup'
import { getRawAgentLaunchProfiles } from '../../../shared/agent-launch-profile-agents'
import { resolveAgentAccountResumeLaunchConfig } from '@/lib/agent-account-resume'
import {
  resolveAgentProfileLaunchTarget,
  type AgentProfileHostScopeState
} from '@/lib/agent-profile-launch-target'

export type AiVaultAccountLaunch = Pick<SleepingAgentLaunchConfig, 'agentCommand' | 'agentEnv'>

/**
 * The profile a local history session must resume under, or null when no profile owns its
 * transcript; agents without profiles keep the plain resume. Throws when the owning account is
 * ambiguous, rather than resuming under another one.
 */
export function resolveAiVaultAccountLaunch(args: {
  state: AgentProfileHostScopeState
  worktreeId?: string | null
  session: AiVaultResumeCommandSession
}): AiVaultAccountLaunch | null {
  const { session, state } = args
  const worktreeId = args.worktreeId ?? state.activeWorktreeId
  if (
    (session.agent !== 'pi' && session.agent !== 'claude') ||
    !hasConfiguredProfiles(getRawAgentLaunchProfiles(state.settings, session.agent)) ||
    parseExecutionHostId(session.executionHostId)?.kind !== 'local' ||
    !session.filePath ||
    parseWslUncPath(session.filePath) ||
    !worktreeId ||
    resolveAgentProfileLaunchTarget(state, worktreeId) !== 'local-native'
  ) {
    return null
  }
  const resolution = resolveAgentAccountResumeLaunchConfig({
    state,
    agent: session.agent,
    worktreeId,
    transcriptPath: session.filePath,
    capturedLaunchConfig: { agentArgs: '', agentEnv: {} },
    originConnectionId: null
  })
  if (!resolution.ok) {
    throw new Error(resolution.message)
  }
  const launchConfig = resolution.launchConfig
  // Only a matched profile pins an account; otherwise the configured agent command stays in charge.
  const profileMatched =
    launchConfig?.agentEnv.PI_CODING_AGENT_DIR || launchConfig?.agentEnv[CLAUDE_LAUNCH_PROFILE_ENV]
  return launchConfig?.agentCommand && profileMatched
    ? { agentCommand: launchConfig.agentCommand, agentEnv: launchConfig.agentEnv }
    : null
}

function hasConfiguredProfiles(rawProfiles: unknown): boolean {
  return Array.isArray(rawProfiles) && rawProfiles.length > 0
}
