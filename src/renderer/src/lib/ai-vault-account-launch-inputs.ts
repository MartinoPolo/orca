import type { AiVaultAgent } from '../../../shared/ai-vault-types'
import type { SleepingAgentLaunchConfig } from '../../../shared/agent-session-resume'
import { parseWslUncPath } from '../../../shared/wsl-paths'
import type { ExecutionHostId } from '../../../shared/execution-host'
import { LOCAL_EXECUTION_HOST_ID, parseExecutionHostId } from '../../../shared/execution-host'
import {
  resolveAgentProfileLaunchTarget,
  type AgentProfileHostScopeState
} from '@/lib/agent-profile-launch-target'
import {
  AgentAccountResumeError,
  getAgentAccountEnvironment,
  resolveAgentAccountResumeLaunchConfig
} from '@/lib/agent-account-resume'
import {
  getLocalDefaultPiAgentDirectory,
  PiResumeProfileError,
  resolvePiHistoryLaunchConfig
} from '@/lib/pi-profile-resume-provenance'
import { getKnownExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'

export type AiVaultAccountLaunchInputs = {
  agentArgs: string
  agentEnv: Record<string, string>
  commandOverride?: string | null
  launchConfig: SleepingAgentLaunchConfig | null
  accountEnvironment: Record<string, string> | null
}

type AiVaultAccountLaunchArgs = {
  agent: AiVaultAgent
  transcriptPath?: string
  sessionExecutionHostId?: ExecutionHostId
  worktreeId?: string | null
  state: AgentProfileHostScopeState
  commandOverride?: string | null
  agentArgs: string
  agentEnv: Record<string, string>
}

/** Pins a history resume to the account that owns its transcript, or keeps the recorded launch. */
export function resolveAiVaultAccountLaunchInputs(
  args: AiVaultAccountLaunchArgs
): AiVaultAccountLaunchInputs {
  const launchConfig = isLocalPiHistory(args)
    ? resolveLocalPiHistoryLaunchConfig(args)
    : resolveHostProfileLaunchConfig(args)
  return {
    agentArgs: launchConfig?.agentArgs ?? args.agentArgs,
    agentEnv: launchConfig?.agentEnv ?? args.agentEnv,
    commandOverride: launchConfig?.agentCommand ?? args.commandOverride,
    launchConfig,
    accountEnvironment: launchConfig ? getAgentAccountEnvironment(launchConfig) : null
  }
}

function isLocalPiHistory(args: AiVaultAccountLaunchArgs): boolean {
  return (
    args.agent === 'pi' &&
    (args.sessionExecutionHostId === LOCAL_EXECUTION_HOST_ID ||
      args.sessionExecutionHostId === undefined) &&
    !parseWslUncPath(args.transcriptPath?.trim() ?? '')
  )
}

function resolveLocalPiHistoryLaunchConfig(
  args: AiVaultAccountLaunchArgs
): SleepingAgentLaunchConfig | null {
  const targetWorktreeId = args.worktreeId ?? args.state.activeWorktreeId
  if (!targetWorktreeId) {
    throw new PiResumeProfileError(
      'Orca cannot resume this Pi session until its target workspace is known.'
    )
  }
  const target = resolveAgentProfileLaunchTarget(args.state, targetWorktreeId)
  if (target === 'unresolved') {
    throw new PiResumeProfileError(
      'Orca cannot resume this Pi session until its target workspace owner is known.'
    )
  }
  if (target !== 'local-native') {
    return null
  }
  return resolvePiHistoryLaunchConfig({
    transcriptPath: args.transcriptPath,
    commandOverride: args.commandOverride,
    agentArgs: args.agentArgs,
    agentEnv: args.agentEnv,
    profiles: args.state.settings?.piLaunchProfiles,
    allowProfileSelection: args.sessionExecutionHostId === LOCAL_EXECUTION_HOST_ID,
    defaultAgentDirectory: getLocalDefaultPiAgentDirectory()
  })
}

function resolveHostProfileLaunchConfig(
  args: AiVaultAccountLaunchArgs
): SleepingAgentLaunchConfig | null {
  const sessionHost = parseExecutionHostId(args.sessionExecutionHostId)
  const isProfileSession =
    (args.agent === 'claude' && sessionHost?.kind === 'local') ||
    ((args.agent === 'claude' || args.agent === 'pi') && sessionHost?.kind === 'ssh')
  const worktreeId = args.worktreeId ?? args.state.activeWorktreeId
  if (!sessionHost || !isProfileSession || !worktreeId) {
    return null
  }
  // Why: a history row names a transcript only on the host that recorded it.
  if (
    parseExecutionHostId(getKnownExecutionHostIdForWorktree(args.state, worktreeId))?.id !==
    sessionHost.id
  ) {
    return null
  }
  const resolution = resolveAgentAccountResumeLaunchConfig({
    state: args.state,
    agent: args.agent,
    worktreeId,
    transcriptPath: args.transcriptPath,
    capturedLaunchConfig: { agentArgs: args.agentArgs, agentEnv: args.agentEnv },
    originConnectionId: sessionHost.kind === 'ssh' ? sessionHost.targetId : null
  })
  if (!resolution.ok) {
    throw new AgentAccountResumeError(resolution.message)
  }
  // Why: without a matched profile the host's recorded resume command stays authoritative.
  return resolution.launchConfig?.agentCommand ? resolution.launchConfig : null
}
