import { describe, expect, it } from 'vitest'
import {
  canLaunchComposerPiProfile,
  canLaunchFolderComposerPiProfile,
  getValidatedComposerPiProfile,
  isComposerRepoPiProfileTarget
} from './composer-pi-profile-target'
import { CLIENT_PLATFORM } from '@/lib/new-workspace'
import type { ProjectGroup } from '../../../shared/project-group-types'

const profile = { id: 'work', name: 'piw', command: '/tools/piw', agentDirectory: '/accounts/work' }
const localTarget = {
  executionHostId: 'local' as const,
  connectionId: null,
  launchPlatform: CLIENT_PLATFORM
}

describe('composer Pi profile target', () => {
  it('refuses SSH, paired runtime, WSL, ephemeral VM, and unresolved hosts', () => {
    expect(canLaunchComposerPiProfile(localTarget)).toBe(true)
    expect(
      canLaunchComposerPiProfile({
        ...localTarget,
        launchPlatform: CLIENT_PLATFORM === 'win32' ? 'linux' : 'win32'
      })
    ).toBe(false)
    expect(canLaunchComposerPiProfile({ ...localTarget, executionHostId: null })).toBe(false)
    expect(canLaunchComposerPiProfile({ ...localTarget, connectionId: 'ssh-1' })).toBe(false)
    expect(canLaunchComposerPiProfile({ ...localTarget, runtimeEnvironmentId: 'paired' })).toBe(
      false
    )
    expect(canLaunchComposerPiProfile({ ...localTarget, ephemeralVmRecipeId: 'vm' })).toBe(false)
    expect(
      isComposerRepoPiProfileTarget({
        ...localTarget,
        settings: { activeRuntimeEnvironmentId: 'paired' },
        ephemeralVmRecipeId: null
      })
    ).toBe(false)
  })

  it('allows local folders but excludes remote, paired, and Windows WSL folders', () => {
    const group: ProjectGroup = {
      id: 'group',
      name: 'Group',
      parentPath: CLIENT_PLATFORM === 'win32' ? 'C:/repos' : '/repos',
      parentGroupId: null,
      createdFrom: 'manual',
      tabOrder: 0,
      isCollapsed: false,
      color: null,
      createdAt: 0,
      updatedAt: 0
    }
    expect(canLaunchFolderComposerPiProfile(group)).toBe(true)
    expect(canLaunchFolderComposerPiProfile({ ...group, connectionId: 'ssh-1' })).toBe(false)
    expect(canLaunchFolderComposerPiProfile({ ...group, executionHostId: 'runtime:paired' })).toBe(
      false
    )
    if (CLIENT_PLATFORM === 'win32') {
      expect(
        canLaunchFolderComposerPiProfile({ ...group, parentPath: '//wsl.localhost/Ubuntu/home' })
      ).toBe(false)
    }
  })

  it('rejects a removed, changed, or ineligible selected profile rather than switching accounts', () => {
    expect(() => getValidatedComposerPiProfile(profile, undefined, true)).toThrow('unavailable')
    expect(() =>
      getValidatedComposerPiProfile(
        profile,
        { piLaunchProfiles: [{ ...profile, agentDirectory: '/accounts/other' }] },
        true
      )
    ).toThrow('unavailable')
    expect(() =>
      getValidatedComposerPiProfile(profile, { piLaunchProfiles: [profile] }, false)
    ).toThrow('unavailable')
  })
})
