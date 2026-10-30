import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../shared/global-settings-types'

const DEFAULT_HOOK_SETTINGS: Pick<
  GlobalSettings,
  'agentStatusHooksEnabled' | 'disabledTuiAgents' | 'claudeLaunchProfiles'
> = {
  agentStatusHooksEnabled: true,
  disabledTuiAgents: [],
  claudeLaunchProfiles: []
}

const mocks = vi.hoisted(() => ({ apply: vi.fn(), reconcileProfiles: vi.fn() }))
vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('../agent-hooks/managed-agent-hook-controls', () => ({
  applyAgentStatusHooksEnabled: mocks.apply,
  reconcileClaudeLaunchProfileHooks: mocks.reconcileProfiles
}))
vi.mock('../agent-hooks/install-telemetry', () => ({ recordManagedHookInstallFailure: vi.fn() }))

import { reconcileSettingsManagedHooks } from './settings-managed-hook-reconciliation'

const profile = { id: 'work', name: 'Work', command: 'claude', agentDirectory: '/accounts/work' }
beforeEach(() => {
  mocks.apply.mockReset().mockResolvedValue([])
  mocks.reconcileProfiles.mockReset().mockResolvedValue([])
})

describe('settings managed hook reconciliation', () => {
  it('reconciles Claude profile hooks when a profile root is added', async () => {
    const before = DEFAULT_HOOK_SETTINGS
    const updated = { ...before, claudeLaunchProfiles: [profile] }
    await reconcileSettingsManagedHooks({ getSettings: () => updated }, before, updated, updated)
    expect(mocks.reconcileProfiles).toHaveBeenCalledWith(before, updated, expect.any(Object))
    expect(mocks.apply).not.toHaveBeenCalled()
  })

  it('does not reinstall Claude twice when both profiles and hook toggles change', async () => {
    const before = { ...DEFAULT_HOOK_SETTINGS, agentStatusHooksEnabled: false }
    const updated = { ...before, agentStatusHooksEnabled: true, claudeLaunchProfiles: [profile] }
    await reconcileSettingsManagedHooks({ getSettings: () => updated }, before, updated, updated)
    expect(mocks.reconcileProfiles).toHaveBeenCalledTimes(1)
    expect(mocks.apply).toHaveBeenCalledWith(
      true,
      updated,
      expect.objectContaining({ agents: expect.not.arrayContaining(['claude']) })
    )
  })

  it('does not reconcile unchanged normalized Claude profiles', async () => {
    const before = { ...DEFAULT_HOOK_SETTINGS, claudeLaunchProfiles: [profile] }
    const updated = { ...before, claudeLaunchProfiles: [{ ...profile, name: ' Work ' }] }
    await reconcileSettingsManagedHooks({ getSettings: () => updated }, before, updated, updated)
    expect(mocks.reconcileProfiles).not.toHaveBeenCalled()
    expect(mocks.apply).not.toHaveBeenCalled()
  })

  it('keeps saving settings when hook reconciliation fails', async () => {
    const before = DEFAULT_HOOK_SETTINGS
    const updated = { ...before, claudeLaunchProfiles: [profile] }
    mocks.reconcileProfiles.mockRejectedValue(new Error('local filesystem unavailable'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await expect(
        reconcileSettingsManagedHooks({ getSettings: () => updated }, before, updated, updated)
      ).resolves.toBeUndefined()
    } finally {
      warn.mockRestore()
    }
  })
})
