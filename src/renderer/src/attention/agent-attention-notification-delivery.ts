/** Share delivery, categorized sound and blocked-permission fallback across surfaces; callers own message content. Main applies banner preferences after mobile fanout, so callers cannot promise a banner. */
import { playDesktopNotificationSound } from '@/lib/desktop-notification-sound'
import { showBlockedNotificationFallbackToast } from '@/lib/blocked-notification-fallback'
import type {
  NotificationDispatchRequest,
  NotificationDispatchResult,
  NotificationSettings,
  NotificationSoundCategory
} from '../../../shared/notification-settings-types'

export function selectAgentAttentionSound(
  settings: NotificationSettings | undefined,
  category: NotificationSoundCategory
): { soundId: NotificationSettings['customSoundId']; volume: number | undefined } {
  if (category === 'needs-input') {
    return {
      soundId: settings?.needsInputSoundId ?? 'system',
      volume: settings?.needsInputSoundVolume
    }
  }
  if (category === 'failed') {
    return { soundId: settings?.failedSoundId ?? 'system', volume: settings?.failedSoundVolume }
  }
  return { soundId: settings?.customSoundId ?? 'system', volume: settings?.customSoundVolume }
}

// Sound is an event channel, not an OS delivery receipt: it honors the desktop enabled, source and
// machine gates, but never focus suppression, priority or banner cooldown.
function playAgentAttentionSound(
  request: NotificationDispatchRequest,
  settings: NotificationSettings | undefined
): void {
  if (
    settings?.enabled === false ||
    (request.source === 'agent-task-complete' && settings?.agentTaskComplete === false) ||
    (request.source === 'terminal-bell' && settings?.terminalBell === false) ||
    (request.notificationSourceId !== undefined &&
      settings?.mutedNotificationSourceIds?.includes(request.notificationSourceId))
  ) {
    return
  }
  const category = request.soundCategory ?? 'done'
  const sound = selectAgentAttentionSound(settings, category)
  // Main silences the banner's own sound under the same condition, so exactly one sound plays.
  const bannerSilenced =
    sound.soundId !== 'system' ||
    (request.source === 'agent-task-complete' && request.soundCategory !== undefined)
  if (bannerSilenced) {
    void playDesktopNotificationSound(sound.soundId, sound.volume, category)
  }
}

export function deliverAgentAttentionNotification(
  request: NotificationDispatchRequest,
  settings: NotificationSettings | undefined,
  onResult?: (result: NotificationDispatchResult | null) => void
): void {
  void window.api.notifications
    .dispatch(request)
    .then((result) => {
      onResult?.(result)
      // Surface blocked macOS permission in-app rather than silently losing the notification.
      if (result.reason === 'blocked-by-system') {
        showBlockedNotificationFallbackToast()
      }
    })
    .catch((err) => {
      onResult?.(null)
      console.warn('Failed to dispatch notification:', err)
    })
  playAgentAttentionSound(request, settings)
}
