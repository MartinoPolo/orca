import { useEffect, useRef, useState } from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { Button } from '../ui/button'
import { Separator } from '../ui/separator'
import { BellRing, Bot, Siren } from 'lucide-react'
import { useAppStore } from '@/store'
import {
  MacNotificationPermissionCard,
  useMacNotificationPermissionState
} from '@/components/notifications/mac-notification-permission-card'
import { NotificationSettingToggle } from './NotificationSettingToggle'
import { NotificationSoundSection } from './NotificationSoundSection'
import {
  createNotificationVolumeDraftState,
  resolveNotificationVolumeDraftState,
  sendNotificationSettingsTestNotification
} from './notification-settings-copy'
import { translate } from '@/i18n/i18n'
export { getNotificationsPaneSearchEntries } from './notifications-search'
export {
  createNotificationVolumeDraftState,
  resolveNotificationVolumeDraftState,
  sendNotificationSettingsTestNotification
} from './notification-settings-copy'

function useSoundVolumeDraft(sourceVolume: number): [number, (value: number) => void] {
  const [draftState, setDraftState] = useState(() =>
    createNotificationVolumeDraftState(sourceVolume)
  )
  const resolved = resolveNotificationVolumeDraftState(draftState, sourceVolume)
  if (resolved !== draftState) {
    setDraftState(resolved)
  }
  return [
    resolved.draft,
    (value) =>
      setDraftState((current) => ({
        ...resolveNotificationVolumeDraftState(current, sourceVolume),
        draft: value
      }))
  ]
}

type NotificationsPaneProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
}

export function NotificationsPane({
  settings,
  updateSettings
}: NotificationsPaneProps): React.JSX.Element {
  const notificationSettings = settings.notifications
  const notificationSettingsRef = useRef(notificationSettings)
  const [macPermissionState, setMacPermissionState] = useMacNotificationPermissionState(
    notificationSettings.enabled
  )

  const updateNotificationSettings = async (
    updates: Partial<GlobalSettings['notifications']>
  ): Promise<void> => {
    const nextNotifications = {
      ...notificationSettingsRef.current,
      ...updates
    }
    notificationSettingsRef.current = nextNotifications
    await updateSettings({
      notifications: {
        ...nextNotifications
      }
    })
  }

  useEffect(() => {
    notificationSettingsRef.current = notificationSettings
  }, [notificationSettings])

  const [volumeDraft, setVolumeDraft] = useSoundVolumeDraft(notificationSettings.customSoundVolume)
  const [needsInputVolumeDraft, setNeedsInputVolumeDraft] = useSoundVolumeDraft(
    notificationSettings.needsInputSoundVolume ?? 100
  )
  const [failedVolumeDraft, setFailedVolumeDraft] = useSoundVolumeDraft(
    notificationSettings.failedSoundVolume ?? 100
  )

  const handleVolumeCommit = (value: number): void => {
    if (notificationSettingsRef.current.customSoundVolume !== value) {
      void updateNotificationSettings({ customSoundVolume: value })
    }
  }

  const handleSendTestNotification = async (): Promise<void> => {
    useAppStore.getState().recordFeatureInteraction('notifications')
    const showsMacPermissionCard = macPermissionState !== null
    const outcome = await sendNotificationSettingsTestNotification(
      notificationSettings,
      volumeDraft,
      // Why: the card renders delivery state inline, so the ambiguous darwin
      // "check if a banner appeared" toasts would contradict it.
      showsMacPermissionCard ? { suppressSystemPermissionToasts: true } : undefined
    )
    if (!showsMacPermissionCard) {
      return
    }
    if (outcome === 'delivered') {
      setMacPermissionState('enabled')
    } else if (outcome === 'not-displayed') {
      setMacPermissionState('blocked')
    }
  }

  return (
    <div className="space-y-1">
      {macPermissionState !== null ? (
        <div className="pb-3">
          <MacNotificationPermissionCard state={macPermissionState} />
        </div>
      ) : null}
      <NotificationSettingToggle
        label={translate(
          'auto.components.settings.NotificationsPane.841c8c549f',
          'Enable Notifications'
        )}
        description={translate(
          'auto.components.settings.NotificationsPane.deff6d30da',
          'Agent sounds and native banners for background events.'
        )}
        checked={notificationSettings.enabled}
        onToggle={() => {
          if (!notificationSettings.enabled) {
            useAppStore.getState().recordFeatureInteraction('notifications')
          }
          void updateNotificationSettings({ enabled: !notificationSettings.enabled })
        }}
      />

      <Separator />

      <NotificationSettingToggle
        icon={<Bot className="size-4" />}
        label={translate(
          'auto.components.settings.NotificationsPane.ca76d06fd2',
          'Agent Task Complete'
        )}
        description={translate(
          'auto.components.settings.NotificationsPane.55f901a59b',
          'Alert when an agent finishes, needs input, or becomes blocked.'
        )}
        checked={notificationSettings.agentTaskComplete}
        disabled={!notificationSettings.enabled}
        onToggle={() =>
          void updateNotificationSettings({
            agentTaskComplete: !notificationSettings.agentTaskComplete
          })
        }
      />

      <NotificationSettingToggle
        icon={<Siren className="size-4" />}
        label={translate('auto.components.settings.NotificationsPane.591fe605b9', 'Terminal Bell')}
        description={translate(
          'auto.components.settings.NotificationsPane.b6fc369244',
          'A background terminal emits a bell character.'
        )}
        checked={notificationSettings.terminalBell}
        disabled={!notificationSettings.enabled}
        onToggle={() =>
          void updateNotificationSettings({
            terminalBell: !notificationSettings.terminalBell
          })
        }
      />

      <Separator />

      <NotificationSoundSection
        notificationSettings={notificationSettings}
        notificationsEnabled={notificationSettings.enabled}
        volumeDraft={volumeDraft}
        onVolumeDraftChange={setVolumeDraft}
        onVolumeCommit={handleVolumeCommit}
        onUpdateNotificationSettings={updateNotificationSettings}
      />

      <NotificationSoundSection
        category="needs-input"
        notificationSettings={notificationSettings}
        notificationsEnabled={notificationSettings.enabled}
        volumeDraft={needsInputVolumeDraft}
        onVolumeDraftChange={setNeedsInputVolumeDraft}
        onVolumeCommit={(value) =>
          void updateNotificationSettings({ needsInputSoundVolume: value })
        }
        onUpdateNotificationSettings={updateNotificationSettings}
      />
      <NotificationSoundSection
        category="failed"
        notificationSettings={notificationSettings}
        notificationsEnabled={notificationSettings.enabled}
        volumeDraft={failedVolumeDraft}
        onVolumeDraftChange={setFailedVolumeDraft}
        onVolumeCommit={(value) => void updateNotificationSettings({ failedSoundVolume: value })}
        onUpdateNotificationSettings={updateNotificationSettings}
      />

      <Separator />

      <NotificationSettingToggle
        label={translate(
          'auto.components.settings.NotificationsPane.00cd406dbb',
          'Suppress While Focused'
        )}
        description={translate(
          'auto.components.settings.NotificationsPane.2772d2f257',
          'Skip banners when the triggering worktree is already visible; sounds still play.'
        )}
        checked={notificationSettings.suppressWhenFocused}
        disabled={!notificationSettings.enabled}
        onToggle={() =>
          void updateNotificationSettings({
            suppressWhenFocused: !notificationSettings.suppressWhenFocused
          })
        }
      />

      <div className="flex flex-wrap items-center gap-2 pt-3">
        <Button
          variant="outline"
          size="sm"
          disabled={!notificationSettings.enabled}
          onClick={() => void handleSendTestNotification()}
          className="gap-2"
        >
          <BellRing className="size-3.5" />
          {translate(
            'auto.components.settings.NotificationsPane.906b4afebf',
            'Send Test Notification'
          )}
        </Button>
      </div>
    </div>
  )
}
