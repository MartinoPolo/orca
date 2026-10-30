import { describe, expect, it } from 'vitest'
import {
  assertComposerProfileAgent,
  getComposerAgentProfiles,
  getValidatedComposerAgentProfile,
  resolveComposerProfileHostScope,
  type ComposerProfileHostTarget
} from './composer-agent-profile-target'
import { CLIENT_PLATFORM } from '@/lib/new-workspace'

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
const localTarget: ComposerProfileHostTarget = {
  executionHostId: 'local',
  connectionId: null,
  runtimeEnvironmentId: null,
  launchHost: { kind: 'known', platform: CLIENT_PLATFORM, hostKind: 'local' },
  ephemeralVmRecipeId: null,
  sshConnectionStates: new Map([['ssh-1', { remoteHomeDirectory: '/home/agent' }]])
}
const sshTarget: ComposerProfileHostTarget = {
  ...localTarget,
  executionHostId: 'ssh:ssh-1',
  connectionId: 'ssh-1',
  launchHost: { kind: 'known', platform: 'linux', hostKind: 'ssh' }
}
const remoteScope = { kind: 'remote', homeDirectory: '/home/agent' } as const
const localScope = { kind: 'local', homeDirectory: undefined } as const

describe('composer agent profile host scope', () => {
  it('scopes local native targets to this machine', () => {
    expect(resolveComposerProfileHostScope(localTarget)?.kind).toBe('local')
  })

  it('refuses paired runtime, ephemeral VM, WSL, withheld, and unresolved hosts', () => {
    const foreignPlatform = CLIENT_PLATFORM === 'win32' ? 'linux' : 'win32'
    for (const target of [
      {
        ...localTarget,
        launchHost: { kind: 'known', platform: foreignPlatform, hostKind: 'local' }
      },
      { ...localTarget, launchHost: { kind: 'withheld', reason: 'pending' } },
      { ...localTarget, executionHostId: null },
      { ...localTarget, runtimeEnvironmentId: 'paired' },
      { ...localTarget, ephemeralVmRecipeId: 'vm' }
    ] satisfies ComposerProfileHostTarget[]) {
      expect(resolveComposerProfileHostScope(target)).toBeNull()
    }
  })

  it('scopes SSH targets to the home the host reported', () => {
    expect(resolveComposerProfileHostScope(sshTarget)).toEqual(remoteScope)
    expect(
      resolveComposerProfileHostScope({ ...sshTarget, sshConnectionStates: new Map() })
    ).toBeNull()
    expect(resolveComposerProfileHostScope({ ...sshTarget, connectionId: 'ssh-2' })).toBeNull()
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

  it('omits disabled agents and every profile when the target has no scope', () => {
    expect(getComposerAgentProfiles(settings, localScope, ['pi'])).toEqual([
      { agent: 'claude', profile: claudeProfile }
    ])
    expect(getComposerAgentProfiles(settings, null, [])).toEqual([])
  })

  it('rejects a removed, changed, or out-of-scope profile rather than switching accounts', () => {
    const selection = { agent: 'pi', profile: piProfile } as const
    expect(() => getValidatedComposerAgentProfile(selection, undefined, localScope)).toThrow(
      'unavailable'
    )
    expect(() =>
      getValidatedComposerAgentProfile(
        selection,
        { piLaunchProfiles: [{ ...piProfile, agentDirectory: '/accounts/other' }] },
        localScope
      )
    ).toThrow('unavailable')
    expect(() => getValidatedComposerAgentProfile(selection, settings, null)).toThrow('unavailable')
    expect(() => getValidatedComposerAgentProfile(selection, settings, remoteScope)).toThrow(
      'Pi profile is unavailable'
    )
  })

  it('returns the host-resolved profile for a remote selection', () => {
    const scopedProfile = { ...claudeProfile, agentDirectory: '/home/agent/.claude-work' }
    expect(
      getValidatedComposerAgentProfile(
        { agent: 'claude', profile: scopedProfile },
        settings,
        remoteScope
      )
    ).toEqual({ agent: 'claude', profile: scopedProfile })
    expect(getValidatedComposerAgentProfile(undefined, settings, null)).toBeUndefined()
  })

  it('refuses a launch whose agent no longer matches the picked profile', () => {
    const selection = { agent: 'claude', profile: claudeProfile } as const
    expect(() => assertComposerProfileAgent(selection, 'claude')).not.toThrow()
    expect(() => assertComposerProfileAgent(selection, null)).toThrow('no longer available')
    expect(() => assertComposerProfileAgent(undefined, null)).not.toThrow()
  })
})
