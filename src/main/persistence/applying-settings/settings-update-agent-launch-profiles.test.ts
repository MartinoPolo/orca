import { describe, expect, it, vi } from 'vitest'
import { getDefaultPersistedState } from '../../../shared/constants'
import { updateSettings, type SettingsMutationOperations } from './settings-update'

function makeOperations(): SettingsMutationOperations {
  return {
    state: getDefaultPersistedState('/tmp'),
    bumpLocalWorktreeScanGeneration: vi.fn(),
    removeRetainedBlob: vi.fn(),
    scheduleSave: vi.fn(),
    notifySettingsChanged: vi.fn()
  }
}

const rawProfiles = [
  { id: 'work', name: ' Work ', command: ' piw ', agentDirectory: '/accounts/work' },
  { id: 'personal', name: 'work', command: 'pip', agentDirectory: '/accounts/personal' },
  { id: 'relative', name: 'Relative', command: 'pi', agentDirectory: 'accounts/relative' }
]

describe('updateSettings agent launch profiles', () => {
  it.each(['piLaunchProfiles', 'claudeLaunchProfiles'] as const)(
    'persists only valid %s with normalized unique names',
    (key) => {
      expect(updateSettings(makeOperations(), { [key]: rawProfiles })[key]).toEqual([
        { id: 'work', name: 'Work', command: 'piw', agentDirectory: '/accounts/work' }
      ])
    }
  )
})
