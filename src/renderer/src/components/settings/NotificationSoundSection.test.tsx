// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDefaultNotificationSettings, getDefaultSettings } from '../../../../shared/constants'

vi.mock('../ui/select', () => ({
  Select: ({
    onValueChange,
    children
  }: {
    onValueChange: (value: string) => void
    children: React.ReactNode
  }) => (
    <div>
      <button onClick={() => onValueChange('choose-custom-file')}>Choose file</button>
      {children}
    </div>
  ),
  SelectContent: () => null,
  SelectItem: () => null,
  SelectSeparator: () => null,
  SelectTrigger: () => null,
  SelectValue: () => null
}))
vi.mock('../ui/slider', () => ({
  Slider: ({
    onValueChange,
    onValueCommit
  }: {
    onValueChange: (value: number[]) => void
    onValueCommit: (value: number[]) => void
  }) => (
    <button
      onClick={() => {
        onValueChange([35])
        onValueCommit([35])
      }}
    >
      Set volume
    </button>
  )
}))

import { NotificationSoundSection } from './NotificationSoundSection'
import { NotificationsPane } from './NotificationsPane'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('notification sound category controls', () => {
  it('commits volume only to the selected category in the settings pane', () => {
    const updateSettings = vi.fn()
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { notifications: { getPermissionStatus: vi.fn(async () => ({ supported: false })) } }
    })
    const notifications: ReturnType<typeof getDefaultNotificationSettings> = {
      ...getDefaultNotificationSettings(),
      customSoundId: 'blip',
      customSoundPath: null,
      customSoundVolume: 50,
      needsInputSoundId: 'bong',
      needsInputSoundPath: null,
      needsInputSoundVolume: 70,
      failedSoundId: 'clack',
      failedSoundPath: null,
      failedSoundVolume: 90
    }
    render(
      <NotificationsPane
        settings={{ ...getDefaultSettings('/workspace'), notifications }}
        updateSettings={updateSettings}
      />
    )
    const sliders = screen.getAllByText('Set volume')
    expect(sliders).toHaveLength(3)
    fireEvent.click(sliders[1])
    expect(updateSettings).toHaveBeenLastCalledWith({
      notifications: { ...notifications, needsInputSoundVolume: 35 }
    })
    fireEvent.click(sliders[2])
    expect(updateSettings).toHaveBeenLastCalledWith({
      notifications: { ...notifications, needsInputSoundVolume: 35, failedSoundVolume: 35 }
    })
  })

  it.each([
    ['done', 'customSoundId', 'customSoundPath'],
    ['needs-input', 'needsInputSoundId', 'needsInputSoundPath'],
    ['failed', 'failedSoundId', 'failedSoundPath']
  ] as const)(
    'updates only %s settings and previews that category',
    async (category, idKey, pathKey) => {
      const update = vi.fn(async () => {})
      const playSound = vi.fn(async () => ({ played: true }))
      Object.defineProperty(window, 'api', {
        configurable: true,
        value: {
          shell: { pickAudio: vi.fn(async () => '/audio/chosen.wav') },
          notifications: { playSound }
        }
      })
      const settings: ReturnType<typeof getDefaultNotificationSettings> = {
        ...getDefaultNotificationSettings(),
        customSoundId: 'blip',
        customSoundPath: '/audio/done.wav',
        needsInputSoundId: 'bong',
        needsInputSoundPath: '/audio/input.wav',
        failedSoundId: 'clack',
        failedSoundPath: '/audio/failed.wav'
      }
      const volumeCommit = vi.fn()
      render(
        <NotificationSoundSection
          notificationSettings={settings}
          notificationsEnabled
          volumeDraft={60}
          onVolumeDraftChange={vi.fn()}
          onVolumeCommit={volumeCommit}
          onUpdateNotificationSettings={update}
          category={category}
        />
      )
      fireEvent.click(screen.getByText('Choose file'))
      await waitFor(() =>
        expect(update).toHaveBeenCalledWith({ [idKey]: 'custom', [pathKey]: '/audio/chosen.wav' })
      )
      expect(playSound).toHaveBeenCalledWith({ force: true, volume: 60, category })
      fireEvent.click(screen.getByText('Set volume'))
      expect(volumeCommit).toHaveBeenCalledWith(35)
    }
  )
})
