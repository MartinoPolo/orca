import { getDefaultAgentDirectory, type AgentLaunchProfile } from './agent-launch-profiles'

/** Names the profile a launch is pinned to so managed account routing leaves its root alone. */
export const CLAUDE_LAUNCH_PROFILE_ENV = 'ORCA_CLAUDE_LAUNCH_PROFILE'

export function getDefaultClaudeConfigDirectory(
  homeDirectory: string | undefined
): string | undefined {
  return getDefaultAgentDirectory(homeDirectory, '.claude')
}

export function buildClaudeLaunchProfileEnv(profile: AgentLaunchProfile): Record<string, string> {
  return { CLAUDE_CONFIG_DIR: profile.agentDirectory, [CLAUDE_LAUNCH_PROFILE_ENV]: profile.id }
}

export function isClaudeLaunchProfileEnv(
  env: Readonly<Record<string, string | undefined>> | undefined
): boolean {
  return Boolean(env?.[CLAUDE_LAUNCH_PROFILE_ENV] && env.CLAUDE_CONFIG_DIR)
}
