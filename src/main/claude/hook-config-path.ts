import { isAbsolute, join } from 'node:path'
import {
  getConfigPath,
  getRemoteConfigPath,
  type ClaudeCompatibleHookSettings
} from './hook-settings'

/** Resolves a profile's `CLAUDE_CONFIG_DIR` settings file, or the default one without a profile. */
export function resolveLocalHookConfigPath(
  settings: ClaudeCompatibleHookSettings,
  configDirectory?: string
): string {
  if (configDirectory === undefined) {
    return getConfigPath(settings)
  }
  if (!isAbsolute(configDirectory)) {
    throw new Error('Claude config directory must be absolute')
  }
  return join(configDirectory, 'settings.json')
}

export function resolveRemoteHookConfigPath(
  remoteHome: string,
  settings: ClaudeCompatibleHookSettings,
  configDirectory?: string
): string {
  return configDirectory
    ? `${configDirectory.replace(/\/$/, '')}/settings.json`
    : getRemoteConfigPath(remoteHome, settings)
}
