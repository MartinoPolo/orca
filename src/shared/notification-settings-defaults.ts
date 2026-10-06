import type { NotificationSettings } from './notification-settings-types'

export function getDefaultNotificationSettings(): NotificationSettings {
  return {
    enabled: true,
    agentTaskComplete: true,
    terminalBell: false,
    suppressWhenFocused: true,
    customSoundId: 'system',
    customSoundPath: null,
    customSoundVolume: 100,
    needsInputSoundId: 'system',
    needsInputSoundPath: null,
    needsInputSoundVolume: 100,
    failedSoundId: 'system',
    failedSoundPath: null,
    failedSoundVolume: 100,
    mutedNotificationSourceIds: []
  }
}
