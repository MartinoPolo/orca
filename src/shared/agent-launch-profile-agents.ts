import type { GlobalSettings } from './global-settings-types'
import { normalizeAgentLaunchProfiles, type AgentLaunchProfile } from './agent-launch-profiles'
import {
  buildClaudeLaunchProfileEnv,
  getDefaultClaudeConfigDirectory
} from './claude-launch-profiles'
import { buildPiLaunchProfileEnv, getDefaultPiAgentDirectory } from './pi-launch-profiles'
import type { TuiAgent } from './tui-agent'

export const AGENT_LAUNCH_PROFILE_AGENTS = {
  pi: {
    label: 'Pi',
    settingsKey: 'piLaunchProfiles',
    accountEnvironmentName: 'PI_CODING_AGENT_DIR',
    getDefaultAgentDirectory: getDefaultPiAgentDirectory,
    buildEnvironment: buildPiLaunchProfileEnv
  },
  claude: {
    label: 'Claude',
    settingsKey: 'claudeLaunchProfiles',
    accountEnvironmentName: 'CLAUDE_CONFIG_DIR',
    getDefaultAgentDirectory: getDefaultClaudeConfigDirectory,
    buildEnvironment: buildClaudeLaunchProfileEnv
  }
} as const satisfies Partial<
  Record<
    TuiAgent,
    {
      label: string
      settingsKey: 'piLaunchProfiles' | 'claudeLaunchProfiles'
      accountEnvironmentName: string
      getDefaultAgentDirectory: (homeDirectory: string | undefined) => string | undefined
      buildEnvironment: (profile: AgentLaunchProfile) => Record<string, string>
    }
  >
>

export type ProfileAgent = keyof typeof AGENT_LAUNCH_PROFILE_AGENTS

export const PROFILE_AGENTS: readonly ProfileAgent[] = ['pi', 'claude']

export type AgentProfileSelection = { agent: ProfileAgent; profile: AgentLaunchProfile }

export function isProfileAgent(agent: TuiAgent): agent is ProfileAgent {
  return Object.hasOwn(AGENT_LAUNCH_PROFILE_AGENTS, agent)
}

type ProfileSettings = Partial<Pick<GlobalSettings, 'piLaunchProfiles' | 'claudeLaunchProfiles'>>

export function getRawAgentLaunchProfiles(
  settings: ProfileSettings | null | undefined,
  agent: ProfileAgent
): unknown {
  return settings?.[AGENT_LAUNCH_PROFILE_AGENTS[agent].settingsKey]
}

export function getAgentLaunchProfiles(
  settings: ProfileSettings | null | undefined,
  agent: ProfileAgent
): AgentLaunchProfile[] {
  return normalizeAgentLaunchProfiles(getRawAgentLaunchProfiles(settings, agent))
}

export function buildAgentLaunchProfileEnv(
  agent: ProfileAgent,
  profile: AgentLaunchProfile
): Record<string, string> {
  return AGENT_LAUNCH_PROFILE_AGENTS[agent].buildEnvironment(profile)
}
