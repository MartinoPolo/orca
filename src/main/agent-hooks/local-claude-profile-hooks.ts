import { homedir } from 'node:os'
import { isAbsolute, join, normalize } from 'node:path'
import {
  normalizeAgentAccountPath,
  normalizeAgentLaunchProfiles
} from '../../shared/agent-launch-profiles'
import type { GlobalSettings } from '../../shared/global-settings-types'
import type { AgentHookInstallStatus } from '../../shared/agent-hook-types'
import { MANAGED_AGENT_HOOK_REMOVERS } from './managed-agent-hook-registry'
import { errorStatus } from './managed-hook-control-status'

type ClaudeProfileSettings = Partial<Pick<GlobalSettings, 'claudeLaunchProfiles'>> | null

/** Local Claude launch profile roots besides `~/.claude`, which the default install already covers. */
export function getLocalClaudeConfigDirectories(settings: ClaudeProfileSettings): string[] {
  const seen = new Set([normalizeAgentAccountPath(join(homedir(), '.claude'))])
  return normalizeAgentLaunchProfiles(settings?.claudeLaunchProfiles).flatMap((profile) => {
    const directory = normalize(profile.agentDirectory)
    const key = normalizeAgentAccountPath(directory)
    if (!isAbsolute(directory) || seen.has(key)) {
      return []
    }
    seen.add(key)
    return [directory]
  })
}

/** Profile roots the previous settings had and the current settings no longer name. */
export function getRetiredClaudeConfigDirectories(
  previousSettings: ClaudeProfileSettings,
  settings: ClaudeProfileSettings
): string[] {
  const currentDirectories = new Set(
    getLocalClaudeConfigDirectories(settings).map(normalizeAgentAccountPath)
  )
  return getLocalClaudeConfigDirectories(previousSettings).filter(
    (directory) => !currentDirectories.has(normalizeAgentAccountPath(directory))
  )
}

export async function removeClaudeProfileHooks(
  configDirectories: readonly string[]
): Promise<AgentHookInstallStatus[]> {
  const entry = MANAGED_AGENT_HOOK_REMOVERS.find(([agent]) => agent === 'claude')
  if (!entry) {
    return []
  }
  const results: AgentHookInstallStatus[] = []
  for (const configDirectory of configDirectories) {
    try {
      results.push(await entry[1](configDirectory))
    } catch (error) {
      results.push(errorStatus('claude', error))
    }
  }
  return results
}
