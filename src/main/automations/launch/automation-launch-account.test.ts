import { describe, expect, it } from 'vitest'
import type { AgentLaunchProfile } from '../../../shared/agent-launch-profiles'
import {
  resolveAutomationLaunchAccount,
  resolveAutomationTerminalLaunchAccount
} from './automation-launch-account'

const workProfile: AgentLaunchProfile = {
  id: 'work',
  name: 'ccw',
  command: 'ccw',
  agentDirectory: '/home/ada/.claude-work'
}
const settings = { claudeLaunchProfiles: [workProfile] }
const pinned = { agentId: 'claude' as const, agentProfileId: 'work' }

describe('automation launch account', () => {
  it('resolves the pinned profile and launches unpinned runs on the built-in account', () => {
    expect(resolveAutomationLaunchAccount(pinned, settings)?.profile).toEqual(workProfile)
    expect(resolveAutomationLaunchAccount({ agentId: 'claude' }, settings)).toEqual({
      agent: 'claude',
      profile: undefined,
      profiles: [workProfile]
    })
    expect(resolveAutomationLaunchAccount({ agentId: 'codex' }, settings)).toBeUndefined()
  })

  it('fails a pinned run instead of falling back to another account', () => {
    expect(() => resolveAutomationLaunchAccount(pinned, { claudeLaunchProfiles: [] })).toThrow(
      'no longer exists'
    )
    expect(() => resolveAutomationLaunchAccount(pinned, null)).toThrow('desktop app')
    expect(() => resolveAutomationLaunchAccount({ ...pinned, surface: 'chat' }, settings)).toThrow(
      'only in a terminal'
    )
    expect(resolveAutomationLaunchAccount({ agentId: 'claude' }, null)?.profile).toBeUndefined()
  })

  it('reuses a pane only when it was launched under the same account', () => {
    const envByPane: Record<string, Record<string, string>> = {
      work: { CLAUDE_CONFIG_DIR: '/home/ada/.claude-work/' },
      // Managed account routing gives the built-in account its own root.
      managed: { CLAUDE_CONFIG_DIR: '/home/ada/.claude-managed' },
      bare: {}
    }
    const runtime = {
      getTerminalLaunchEnvironmentForPaneKey: (paneKey: string) =>
        envByPane[paneKey] ? { agent: 'claude' as const, agentEnv: envByPane[paneKey] } : null
    }
    const runs = ['work', 'managed', 'bare', 'unrecorded'].map((paneKey) => ({
      id: paneKey,
      terminalPaneKey: paneKey
    }))
    const reusable = (automation: Parameters<typeof resolveAutomationTerminalLaunchAccount>[1]) =>
      resolveAutomationTerminalLaunchAccount(runtime, automation, runs, settings).runs.map(
        (run) => run.id
      )

    expect(reusable(pinned)).toEqual(['work'])
    expect(reusable({ agentId: 'claude' })).toEqual(['managed', 'bare', 'unrecorded'])
    expect(resolveAutomationTerminalLaunchAccount(runtime, pinned, runs, settings)).toMatchObject({
      launchProfile: workProfile
    })
  })
})
