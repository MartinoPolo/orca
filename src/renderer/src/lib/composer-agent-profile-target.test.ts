import { describe, expect, it } from 'vitest'
import {
  getComposerAgentProfiles,
  getValidatedComposerAgentProfile,
  resolveComposerProfileHostScope,
  resolveComposerRepoProfileHostScope,
  resolveFolderComposerProfileHostScope
} from './composer-agent-profile-target'
import { CLIENT_PLATFORM } from '@/lib/new-workspace'
import type { ProjectGroup } from '../../../shared/project-group-types'
import { admitSshConnectionState } from '../../../shared/ssh-retained-payload-admission'

const piProfile = {
  id: 'work',
  name: 'piw',
  command: '/tools/piw',
  agentDirectory: '/accounts/work'
}
const claudeProfile = {
  id: 'work',
  name: 'ccw',
  command: 'ccw',
  agentDirectory: '/accounts/claude-work',
  remoteAgentDirectory: '~/.claude-work'
}
const sshConnectionStates = new Map([['ssh-1', { remoteHomeDirectory: '/home/agent' }]])
const localTarget = {
  executionHostId: 'local' as const,
  connectionId: null,
  launchPlatform: CLIENT_PLATFORM,
  sshConnectionStates
}
const sshTarget = {
  ...localTarget,
  executionHostId: 'ssh:ssh-1' as const,
  connectionId: 'ssh-1',
  launchPlatform: 'linux' as const
}
const remoteScope = { kind: 'remote', homeDirectory: '/home/agent' } as const

describe('composer agent profile host scope', () => {
  it('scopes local native targets to this machine', () => {
    expect(resolveComposerProfileHostScope(localTarget)?.kind).toBe('local')
  })

  it('refuses paired runtime, ephemeral VM, WSL, and unresolved hosts', () => {
    expect(
      resolveComposerProfileHostScope({
        ...localTarget,
        launchPlatform: CLIENT_PLATFORM === 'win32' ? 'linux' : 'win32'
      })
    ).toBeNull()
    expect(resolveComposerProfileHostScope({ ...localTarget, executionHostId: null })).toBeNull()
    expect(
      resolveComposerProfileHostScope({ ...localTarget, runtimeEnvironmentId: 'paired' })
    ).toBeNull()
    expect(
      resolveComposerProfileHostScope({ ...localTarget, ephemeralVmRecipeId: 'vm' })
    ).toBeNull()
    expect(
      resolveComposerRepoProfileHostScope({
        ...localTarget,
        settings: { activeRuntimeEnvironmentId: 'paired' },
        ephemeralVmRecipeId: null
      })
    ).toBeNull()
  })

  it('scopes SSH targets to the home the host reported', () => {
    expect(resolveComposerProfileHostScope(sshTarget)).toEqual(remoteScope)
    expect(
      resolveComposerProfileHostScope({ ...sshTarget, sshConnectionStates: new Map() })
    ).toBeNull()
    expect(resolveComposerProfileHostScope({ ...sshTarget, connectionId: 'ssh-2' })).toBeNull()
  })

  it('scopes folder groups by their host and excludes Windows WSL folders', () => {
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
    expect(resolveFolderComposerProfileHostScope(group, sshConnectionStates)?.kind).toBe('local')
    expect(
      resolveFolderComposerProfileHostScope(
        { ...group, connectionId: 'ssh-1', parentPath: '/home/agent/repos' },
        sshConnectionStates
      )
    ).toEqual(remoteScope)
    expect(
      resolveFolderComposerProfileHostScope(
        { ...group, executionHostId: 'runtime:paired' },
        sshConnectionStates
      )
    ).toBeNull()
    if (CLIENT_PLATFORM === 'win32') {
      expect(
        resolveFolderComposerProfileHostScope(
          { ...group, parentPath: '//wsl.localhost/Ubuntu/home' },
          sshConnectionStates
        )
      ).toBeNull()
    }
  })
})

describe('composer agent profiles', () => {
  const settings = { piLaunchProfiles: [piProfile], claudeLaunchProfiles: [claudeProfile] }

  it('offers only profiles with a remote root on SSH hosts, resolved against that home', () => {
    expect(getComposerAgentProfiles(settings, remoteScope, [])).toEqual([
      {
        agent: 'claude',
        profile: { ...claudeProfile, agentDirectory: '/home/agent/.claude-work' }
      }
    ])
  })

  it('offers both account profiles after SSH connection state crosses admission', () => {
    const admitted = admitSshConnectionState(
      {
        targetId: 'ssh-1',
        status: 'connected',
        error: null,
        reconnectAttempt: 0,
        remotePlatform: 'linux',
        remoteHomeDirectory: '/home/agent'
      },
      'ssh-1'
    )
    if (!admitted) {
      throw new Error('Valid SSH state was rejected')
    }
    const scope = resolveComposerRepoProfileHostScope({
      ...sshTarget,
      settings: { activeRuntimeEnvironmentId: null },
      ephemeralVmRecipeId: null,
      sshConnectionStates: new Map([['ssh-1', admitted]])
    })
    const remotePiProfile = { ...piProfile, remoteAgentDirectory: '~/.pi/agent-work' }

    expect(
      getComposerAgentProfiles(
        { piLaunchProfiles: [remotePiProfile], claudeLaunchProfiles: [claudeProfile] },
        scope,
        []
      )
    ).toEqual([
      {
        agent: 'pi',
        profile: { ...remotePiProfile, agentDirectory: '/home/agent/.pi/agent-work' }
      },
      { agent: 'claude', profile: { ...claudeProfile, agentDirectory: '/home/agent/.claude-work' } }
    ])
  })

  it('omits disabled agents and every profile when the target has no scope', () => {
    expect(
      getComposerAgentProfiles(settings, { kind: 'local', homeDirectory: undefined }, ['pi'])
    ).toEqual([{ agent: 'claude', profile: claudeProfile }])
    expect(getComposerAgentProfiles(settings, null, [])).toEqual([])
  })

  it('rejects a removed, changed, or out-of-scope profile rather than switching accounts', () => {
    const localScope = { kind: 'local', homeDirectory: undefined } as const
    expect(() => getValidatedComposerAgentProfile('pi', piProfile, undefined, localScope)).toThrow(
      'unavailable'
    )
    expect(() =>
      getValidatedComposerAgentProfile(
        'pi',
        piProfile,
        { piLaunchProfiles: [{ ...piProfile, agentDirectory: '/accounts/other' }] },
        localScope
      )
    ).toThrow('unavailable')
    expect(() => getValidatedComposerAgentProfile('pi', piProfile, settings, null)).toThrow(
      'unavailable'
    )
    expect(() => getValidatedComposerAgentProfile('pi', piProfile, settings, remoteScope)).toThrow(
      'Pi profile is unavailable'
    )
  })

  it('returns the host-resolved profile for a remote selection', () => {
    const scopedProfile = { ...claudeProfile, agentDirectory: '/home/agent/.claude-work' }
    expect(
      getValidatedComposerAgentProfile('claude', scopedProfile, settings, remoteScope)
    ).toEqual(scopedProfile)
    expect(getValidatedComposerAgentProfile('claude', undefined, settings, null)).toBeUndefined()
  })
})
