import { getDefaultAgentDirectory, type AgentLaunchProfile } from './agent-launch-profiles'

export function getDefaultClaudeConfigDirectory(
  homeDirectory: string | undefined
): string | undefined {
  return getDefaultAgentDirectory(homeDirectory, '.claude')
}

export function buildClaudeLaunchProfileEnv(profile: AgentLaunchProfile): Record<string, string> {
  return { CLAUDE_CONFIG_DIR: profile.agentDirectory }
}
