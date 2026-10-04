import type { TuiAgent } from '../../../../shared/tui-agent'
import { normalizeAgentAccountPath } from '../../../../shared/agent-launch-profiles'
import {
  AGENT_LAUNCH_PROFILE_AGENTS,
  isProfileAgent,
  type ProfileAgent
} from '../../../../shared/agent-launch-profile-agents'
import type { SleepingAgentLaunchConfig } from '../../../../shared/agent-session-resume'

function capturedAccountDirectory(
  agent: ProfileAgent,
  config: SleepingAgentLaunchConfig,
  implicitDefaultDirectory: string | undefined
): string | null {
  const runtime = config.agentEnv[AGENT_LAUNCH_PROFILE_AGENTS[agent].accountEnvironmentName]
  const normalizedRuntime = runtime ? normalizeAgentAccountPath(runtime) : ''
  if (runtime && !normalizedRuntime) {
    return null
  }
  if (agent === 'pi') {
    const source = config.agentEnv.ORCA_PI_SOURCE_AGENT_DIR
    const normalizedSource = source ? normalizeAgentAccountPath(source) : ''
    if (
      (source && !normalizedSource) ||
      (normalizedSource && normalizedSource !== normalizedRuntime)
    ) {
      return null
    }
  }
  return (
    normalizedRuntime ||
    (implicitDefaultDirectory ? normalizeAgentAccountPath(implicitDefaultDirectory) : '') ||
    null
  )
}

export function isMatchingPendingAccountStartup(
  agent: ProfileAgent,
  pendingConfig: SleepingAgentLaunchConfig | undefined,
  selectedConfig: SleepingAgentLaunchConfig | undefined,
  implicitDefaultDirectory: string | undefined
): boolean {
  if (!pendingConfig?.agentCommand || !selectedConfig?.agentCommand) {
    return false
  }
  const pendingDirectory = capturedAccountDirectory(agent, pendingConfig, implicitDefaultDirectory)
  const selectedDirectory = capturedAccountDirectory(
    agent,
    selectedConfig,
    implicitDefaultDirectory
  )
  return Boolean(
    pendingDirectory &&
    pendingDirectory === selectedDirectory &&
    pendingConfig.agentCommand === selectedConfig.agentCommand
  )
}

/** Pi launches always pin an account; Claude only once a profile or config root is involved. */
function launchPinsAccount(
  agent: TuiAgent | null | undefined,
  hasProfile: boolean,
  config: SleepingAgentLaunchConfig | undefined
): agent is ProfileAgent {
  if (!agent || !isProfileAgent(agent)) {
    return false
  }
  return (
    agent === 'pi' ||
    hasProfile ||
    Boolean(config?.agentEnv[AGENT_LAUNCH_PROFILE_AGENTS[agent].accountEnvironmentName])
  )
}

/** The agent whose account a pending linked creation must match, or null when none is pinned. */
export function resolvePendingAccountAgent(
  requestedAgent: TuiAgent | null,
  hasProfile: boolean,
  pendingAgent: TuiAgent | null | undefined,
  pendingConfig: SleepingAgentLaunchConfig | undefined
): ProfileAgent | null {
  if (launchPinsAccount(requestedAgent, hasProfile, undefined)) {
    return requestedAgent
  }
  return launchPinsAccount(pendingAgent, false, pendingConfig) ? pendingAgent : null
}
