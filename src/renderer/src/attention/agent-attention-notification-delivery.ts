/**
 * Sending one attention delivery request to main, and the client-side follow-ups that go with it.
 *
 * Extracted so a non-terminal surface reuses this rather than restating it: the categorized sound
 * and the blocked-permission fallback are policy, and a second copy of them would drift. What the
 * request SAYS still belongs to each surface — a terminal arbitrates a title against a hook
 * snapshot, a structured chat reads its projected row — so only the send lives here.
 *
 * Whether a banner actually appears is main's call, not this module's: the enabled/source
 * preferences and the suppress-while-focused setting are applied there, after mobile fan-out.
 * A caller must never promise the user a banner.
 */
import { playDesktopNotificationSound } from '@/lib/desktop-notification-sound'
import { showBlockedNotificationFallbackToast } from '@/lib/blocked-notification-fallback'
import type {
  NotificationDispatchRequest,
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
  settings: NotificationSettings | undefined
): void {
  void window.api.notifications
    .dispatch(request)
    .then((result) => {
      // Why: macOS is silently swallowing notifications (permission off or prompt unanswered) —
      // surface an in-app pointer at the fix instead of letting the alert vanish without a trace.
      if (result.reason === 'blocked-by-system') {
        showBlockedNotificationFallbackToast()
      }
    })
    .catch((err) => {
      console.warn('Failed to dispatch notification:', err)
    })
  playAgentAttentionSound(request, settings)
}
