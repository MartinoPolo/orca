import type { AiVaultAgent } from '../../../shared/ai-vault-types'
import type { SleepingAgentLaunchConfig } from '../../../shared/agent-session-resume'
import { parseWslUncPath } from '../../../shared/wsl-paths'
import type { ExecutionHostId } from '../../../shared/execution-host'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import { resolvePiProfileLaunchTarget } from '@/lib/pi-profile-launch-target'
import {
  getLocalDefaultPiAgentDirectory,
  getPiAccountEnvironment,
  PiResumeProfileError,
  resolvePiHistoryLaunchConfig
} from '@/lib/pi-profile-resume-provenance'

export type AiVaultPiLaunchInputs = {
  agentArgs: string
  agentEnv: Record<string, string>
  commandOverride?: string | null
  launchConfig: SleepingAgentLaunchConfig | null
  accountEnvironment: Record<string, string> | null
}

export function resolveAiVaultPiLaunchInputs(args: {
  agent: AiVaultAgent
  transcriptPath?: string
  sessionExecutionHostId?: ExecutionHostId
  worktreeId?: string | null
  state: Parameters<typeof resolvePiProfileLaunchTarget>[0]
  commandOverride?: string | null
  agentArgs: string
  agentEnv: Record<string, string>
}): AiVaultPiLaunchInputs {
  let launchConfig: SleepingAgentLaunchConfig | null = null
  const originIsLocal = args.sessionExecutionHostId === LOCAL_EXECUTION_HOST_ID
  const originIsUnknown = args.sessionExecutionHostId === undefined
  if (
    args.agent === 'pi' &&
    (originIsLocal || originIsUnknown) &&
    !parseWslUncPath(args.transcriptPath?.trim() ?? '')
  ) {
    const targetWorktreeId = args.worktreeId ?? args.state.activeWorktreeId
    if (!targetWorktreeId) {
      throw new PiResumeProfileError(
        'Orca cannot resume this Pi session until its target workspace is known.'
      )
    }
    const target = resolvePiProfileLaunchTarget(args.state, targetWorktreeId)
    if (target === 'unresolved') {
      throw new PiResumeProfileError(
        'Orca cannot resume this Pi session until its target workspace owner is known.'
      )
    }
    if (target === 'local-native') {
      launchConfig = resolvePiHistoryLaunchConfig({
        transcriptPath: args.transcriptPath,
        commandOverride: args.commandOverride,
        agentArgs: args.agentArgs,
        agentEnv: args.agentEnv,
        profiles: args.state.settings?.piLaunchProfiles,
        allowProfileSelection: originIsLocal,
        defaultAgentDirectory: getLocalDefaultPiAgentDirectory()
      })
    }
  }
  return {
    agentArgs: launchConfig?.agentArgs ?? args.agentArgs,
    agentEnv: launchConfig?.agentEnv ?? args.agentEnv,
    commandOverride: launchConfig?.agentCommand ?? args.commandOverride,
    launchConfig,
    accountEnvironment: launchConfig ? getPiAccountEnvironment(launchConfig) : null
  }
}
