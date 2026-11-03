import { OrchestrationError } from '../../../../orchestration/orchestration-error'
import type { GlobalSettings } from '../../../../../../shared/global-settings-types'
import type { TuiAgent } from '../../../../../../shared/tui-agent'
import {
  findAgentLaunchProfilesForTranscript,
  normalizeAgentAccountPath,
  normalizeAgentProfileName,
  type AgentLaunchProfile
} from '../../../../../../shared/agent-launch-profiles'
import {
  AGENT_LAUNCH_PROFILE_AGENTS,
  getAgentLaunchProfiles,
  isProfileAgent,
  type ProfileAgent
} from '../../../../../../shared/agent-launch-profile-agents'
import type { OrcaRuntimeService } from '../../../../orca-runtime'
import type { WorkerStartInput } from './worker-start-schema'

/** `--launch-profile default` runs the agent's built-in account even under a profile coordinator. */
export const DEFAULT_WORKER_LAUNCH_PROFILE = 'default'

/** What the coordinator's own launch says about the account it runs on. */
export type WorkerCoordinatorAccount = {
  agent: string | null
  /** Hook-reported, so it holds even for a coordinator typed by hand as `ccw`. */
  transcriptPath?: string
  agentEnv: Record<string, string>
}

type ProfileSettings = Partial<Pick<GlobalSettings, 'piLaunchProfiles' | 'claudeLaunchProfiles'>>

/** An explicit `--launch-profile`, else the coordinator's own profile when it runs the same agent. */
export function resolveWorkerLaunchProfile(args: {
  settings: ProfileSettings
  agent: TuiAgent | undefined
  requested: string | undefined
  coordinator: WorkerCoordinatorAccount | null
}): AgentLaunchProfile | undefined {
  const { agent, requested } = args
  if (requested === DEFAULT_WORKER_LAUNCH_PROFILE) {
    return undefined
  }
  if (!agent || !isProfileAgent(agent)) {
    if (requested) {
      throw new OrchestrationError(
        'invalid_argument',
        `--launch-profile applies to Claude and Pi workers; ${agent ?? 'this worker'} has no launch profiles.`
      )
    }
    return undefined
  }
  const profiles = getAgentLaunchProfiles(args.settings, agent)
  if (requested) {
    return requireNamedProfile(profiles, agent, requested)
  }
  return args.coordinator?.agent === agent
    ? coordinatorProfile(profiles, agent, args.coordinator)
    : undefined
}

function requireNamedProfile(
  profiles: readonly AgentLaunchProfile[],
  agent: ProfileAgent,
  requested: string
): AgentLaunchProfile {
  const name = normalizeAgentProfileName(requested)
  const profile = profiles.find(
    (candidate) => candidate.id === requested || normalizeAgentProfileName(candidate.name) === name
  )
  if (!profile) {
    const configured = profiles.map((candidate) => candidate.name).join(', ') || 'none'
    throw new OrchestrationError(
      'invalid_argument',
      `No ${AGENT_LAUNCH_PROFILE_AGENTS[agent].label} launch profile is named ${requested} (configured: ${configured}). Use --launch-profile ${DEFAULT_WORKER_LAUNCH_PROFILE} for the built-in account.`
    )
  }
  return profile
}

function coordinatorProfile(
  profiles: readonly AgentLaunchProfile[],
  agent: ProfileAgent,
  coordinator: WorkerCoordinatorAccount
): AgentLaunchProfile | undefined {
  if (coordinator.transcriptPath) {
    const owners = findAgentLaunchProfilesForTranscript(profiles, coordinator.transcriptPath)
    return owners.length === 1 ? owners[0] : undefined
  }
  const accountRoot =
    coordinator.agentEnv[AGENT_LAUNCH_PROFILE_AGENTS[agent].accountEnvironmentName]
  if (!accountRoot) {
    return undefined
  }
  const normalizedRoot = normalizeAgentAccountPath(accountRoot)
  return profiles.find(
    (profile) => normalizeAgentAccountPath(profile.agentDirectory) === normalizedRoot
  )
}

type WorkerLaunchProfileRuntime = Pick<
  OrcaRuntimeService,
  | 'requireStore'
  | 'getTerminalLaunchEnvironmentForPaneKey'
  | 'getTerminalPaneKey'
  | 'getAgentStatusRowsForPane'
>

/** A reused terminal keeps the account it already runs on. */
export function resolveLocalWorkerLaunchProfile(
  runtime: WorkerLaunchProfileRuntime,
  agent: TuiAgent | undefined,
  params: Pick<WorkerStartInput, 'terminal' | 'launchProfile' | 'from'>
): AgentLaunchProfile | undefined {
  if (params.terminal) {
    return undefined
  }
  const settings = readWorkerLaunchProfileSettings(runtime)
  const mayInherit =
    !params.launchProfile &&
    agent !== undefined &&
    isProfileAgent(agent) &&
    getAgentLaunchProfiles(settings, agent).length > 0
  return resolveWorkerLaunchProfile({
    settings,
    agent,
    requested: params.launchProfile,
    coordinator: mayInherit ? readWorkerCoordinatorAccount(runtime, params.from) : null
  })
}

/** A chat coordinator has no terminal; it starts workers on their built-in account. */
function readWorkerCoordinatorAccount(
  runtime: WorkerLaunchProfileRuntime,
  coordinatorHandle: string
): WorkerCoordinatorAccount | null {
  const paneKey = runtime.getTerminalPaneKey(coordinatorHandle)
  const launch = paneKey ? runtime.getTerminalLaunchEnvironmentForPaneKey(paneKey) : null
  if (!paneKey || !launch) {
    return null
  }
  const reported = runtime
    .getAgentStatusRowsForPane(paneKey)
    .find((row) => row.providerSession?.transcriptPath)
  return {
    agent: reported?.agentType ?? launch.agent,
    ...(reported?.providerSession?.transcriptPath
      ? { transcriptPath: reported.providerSession.transcriptPath }
      : {}),
    agentEnv: launch.agentEnv
  }
}

/** A runtime without a settings store offers no profiles, so its workers keep the built-in account. */
function readWorkerLaunchProfileSettings(runtime: WorkerLaunchProfileRuntime): ProfileSettings {
  try {
    return runtime.requireStore().getSettings() ?? {}
  } catch {
    return {}
  }
}
