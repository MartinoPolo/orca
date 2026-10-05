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

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  reconcileProfiles: vi.fn(),
  sessions: new Map<string, { reconcileClaudeLaunchProfileHooks: () => Promise<void> }>()
}))
vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('../agent-hooks/managed-agent-hook-controls', () => ({
  applyAgentStatusHooksEnabled: mocks.apply,
  reconcileClaudeLaunchProfileHooks: mocks.reconcileProfiles
}))
vi.mock('../agent-hooks/install-telemetry', () => ({ recordManagedHookInstallFailure: vi.fn() }))
vi.mock('./ssh-active-relay-sessions', () => ({ activeSessions: mocks.sessions }))

import { reconcileSettingsManagedHooks } from './settings-managed-hook-reconciliation'

const profile = { id: 'work', name: 'Work', command: 'claude', agentDirectory: '/accounts/work' }
beforeEach(() => {
  mocks.apply.mockReset().mockResolvedValue([])
  mocks.reconcileProfiles.mockReset().mockResolvedValue([])
  mocks.sessions.clear()
})

describe('settings managed hook reconciliation', () => {
  it('does not reinstall Claude twice when both profiles and hook toggles change', async () => {
    const before = { ...DEFAULT_HOOK_SETTINGS, agentStatusHooksEnabled: false }
    const updated = { ...before, agentStatusHooksEnabled: true, claudeLaunchProfiles: [profile] }
    await reconcileSettingsManagedHooks({ getSettings: () => updated }, before, updated, updated)
    expect(mocks.reconcileProfiles).toHaveBeenCalledTimes(1)
    expect(mocks.apply).toHaveBeenCalledWith(
      true,
      updated,
      expect.objectContaining({
        agents: expect.not.arrayContaining(['claude'])
      })
    )
  })

  it('does not reconcile unchanged normalized Claude profiles', async () => {
    const before = { ...DEFAULT_HOOK_SETTINGS, claudeLaunchProfiles: [profile] }
    const updated = { ...before, claudeLaunchProfiles: [{ ...profile, name: ' Work ' }] }
    const remote = vi.fn()
    mocks.sessions.set('live', { reconcileClaudeLaunchProfileHooks: remote })
    await reconcileSettingsManagedHooks({ getSettings: () => updated }, before, updated, updated)
    expect(mocks.reconcileProfiles).not.toHaveBeenCalled()
    expect(mocks.apply).not.toHaveBeenCalled()
    expect(remote).not.toHaveBeenCalled()
  })

  it('waits for every SSH session even when another session fails synchronously', async () => {
    const before = { ...DEFAULT_HOOK_SETTINGS, claudeLaunchProfiles: [] }
    const updated = { ...before, claudeLaunchProfiles: [profile] }
    let finishRemote: (() => void) | undefined
    const remote = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRemote = resolve
        })
    )
    mocks.sessions.set('unavailable', {
      reconcileClaudeLaunchProfileHooks: () => {
        throw new Error('connection lost')
      }
    })
    mocks.sessions.set('live', { reconcileClaudeLaunchProfileHooks: remote })
    let saved = false
    const saving = reconcileSettingsManagedHooks(
      { getSettings: () => updated },
      before,
      updated,
      updated
    ).then(() => {
      saved = true
    })
    await vi.waitFor(() => expect(remote).toHaveBeenCalledTimes(1))
    expect(saved).toBe(false)
    finishRemote?.()
    await saving
    expect(saved).toBe(true)
  })

  it('does not let a local reconciliation failure block connected SSH sessions', async () => {
    const before = { ...DEFAULT_HOOK_SETTINGS, claudeLaunchProfiles: [] }
    const updated = { ...before, claudeLaunchProfiles: [profile] }
    mocks.reconcileProfiles.mockRejectedValue(new Error('local filesystem unavailable'))
    const remote = vi.fn().mockResolvedValue(undefined)
    mocks.sessions.set('live', { reconcileClaudeLaunchProfileHooks: remote })
    await expect(
      reconcileSettingsManagedHooks({ getSettings: () => updated }, before, updated, updated)
    ).resolves.toBeUndefined()
    expect(remote).toHaveBeenCalledTimes(1)
  })
})
