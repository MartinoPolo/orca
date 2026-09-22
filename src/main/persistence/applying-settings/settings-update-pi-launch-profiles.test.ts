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

describe('updateSettings Pi launch profiles', () => {
  it('persists only valid local profiles and normalized unique names', () => {
    const operations = makeOperations()

    expect(
      updateSettings(operations, {
        piLaunchProfiles: [
          { id: 'work', name: ' Work ', command: ' piw ', agentDirectory: '/accounts/work' },
          {
            id: 'personal',
            name: 'work',
            command: 'pip',
            agentDirectory: '/accounts/personal'
          },
          { id: 'relative', name: 'Relative', command: 'pi', agentDirectory: 'accounts/relative' }
        ]
      }).piLaunchProfiles
    ).toEqual([{ id: 'work', name: 'Work', command: 'piw', agentDirectory: '/accounts/work' }])
  })
})
