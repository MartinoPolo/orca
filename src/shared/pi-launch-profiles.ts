import {
  getDefaultAgentDirectory,
  transcriptBelongsToAgentSubdirectory,
  type AgentLaunchProfile
} from './agent-launch-profiles'

export function buildPiLaunchProfileEnv(profile: AgentLaunchProfile): Record<string, string> {
  return {
    PI_CODING_AGENT_DIR: profile.agentDirectory,
    ORCA_PI_SOURCE_AGENT_DIR: profile.agentDirectory
  }
}

export function getDefaultPiAgentDirectory(homeDirectory: string | undefined): string | undefined {
  return getDefaultAgentDirectory(homeDirectory, '.pi/agent')
}

export function isDefaultPiTranscriptPath(
  transcriptPath: string,
  defaultAgentDirectory: string | undefined
): boolean {
  return transcriptBelongsToAgentSubdirectory(transcriptPath, defaultAgentDirectory, 'sessions')
}
