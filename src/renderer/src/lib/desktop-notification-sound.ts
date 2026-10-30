import type { NotificationSoundCategory } from '../../../shared/notification-settings-types'

export async function playDesktopNotificationSound(
  customSoundId: string | null | undefined,
  customSoundVolume?: number | null,
  category: NotificationSoundCategory = 'done'
): Promise<boolean> {
  if (!customSoundId) {
    return false
  }

  try {
    const result = await window.api.notifications.playSound({
      volume: customSoundVolume ?? undefined,
      category
    })
    // Why: 'deduped' is expected when bursts of notifications coalesce — not a failure.
    if (!result.played && result.reason !== 'deduped') {
      console.warn('Failed to play custom notification sound:', result.reason)
    }
    return result.played
  } catch (err) {
    console.warn('Failed to play custom notification sound:', err)
    return false
  }
}
