import { normalizeAgentLaunchProfiles } from '../../shared/agent-launch-profiles'
import type { GlobalSettings } from '../../shared/global-settings-types'

/** `~/`-relative remote roots of named Claude profiles, which need managed hooks besides `~/.claude`. */
export function getRemoteClaudeConfigDirectories(
  settings: Partial<Pick<GlobalSettings, 'claudeLaunchProfiles'>> | null
): string[] {
  const directories = normalizeAgentLaunchProfiles(settings?.claudeLaunchProfiles).flatMap(
    (profile) => (profile.remoteAgentDirectory ? [profile.remoteAgentDirectory] : [])
  )
  return [...new Set(directories)]
}
