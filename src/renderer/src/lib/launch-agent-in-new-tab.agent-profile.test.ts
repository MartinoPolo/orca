import { describe, expect, it } from 'vitest'
import { mockCreateTab, queuedStartups, store } from './launch-agent-in-new-tab-test-fixture'
import type { AgentLaunchProfile } from '../../../shared/agent-launch-profiles'

const claudeWorkProfile: AgentLaunchProfile = {
  id: 'work',
  name: 'ccw',
  command: 'ccw',
  agentDirectory: '/Users/ada/.claude-work',
  remoteAgentDirectory: '~/.claude-work'
}

function useProfileStoreSlices(): void {
  Object.assign(store, { folderWorkspaces: [], projectGroups: [] })
}

function useSshWorkspace(remoteHomeDirectory?: string): void {
  useProfileStoreSlices()
  store.repos = [{ id: 'repo-1', connectionId: 'ssh-a', path: '/home/agent/repo' }]
  store.sshConnectionStates = new Map([
    [
      'ssh-a',
      {
        status: 'connected',
        remotePlatform: 'linux',
        ...(remoteHomeDirectory ? { remoteHomeDirectory } : {})
      }
    ]
  ])
}

describe('launchAgentInNewTab with a named launch profile', () => {
  it('queues the profile command and account root as a terminal, never a chat', async () => {
    useProfileStoreSlices()
    store.settings = { ...store.settings, experimentalNativeChat: true }
    const { launchAgentInNewTab } = await import('./launch-agent-in-new-tab')

    const result = launchAgentInNewTab({
      requestId: 'profile-local',
      agent: 'claude',
      worktreeId: 'wt-1',
      requestedSurface: 'chat',
      agentLaunchProfile: claudeWorkProfile
    })

    expect(result).not.toBeNull()
    const [startup] = queuedStartups()
    expect(startup?.command).toContain('ccw')
    expect(startup?.env).toMatchObject({
      CLAUDE_CONFIG_DIR: '/Users/ada/.claude-work',
      ORCA_CLAUDE_LAUNCH_PROFILE: 'work'
    })
  })

  it('runs the profile under its root inside the SSH host home', async () => {
    useSshWorkspace('/home/agent')
    const { launchAgentInNewTab } = await import('./launch-agent-in-new-tab')

    const result = launchAgentInNewTab({
      requestId: 'profile-ssh',
      agent: 'claude',
      worktreeId: 'wt-1',
      agentLaunchProfile: claudeWorkProfile
    })

    expect(result).not.toBeNull()
    expect(queuedStartups()[0]?.env).toMatchObject({
      CLAUDE_CONFIG_DIR: '/home/agent/.claude-work'
    })
  })

  it.each([
    { label: 'a local-only profile', home: '/home/agent', remote: undefined },
    { label: 'an unknown SSH home', home: undefined, remote: '~/.claude-work' }
  ])('refuses $label on SSH without creating a tab', async ({ home, remote }) => {
    useSshWorkspace(home)
    const { launchAgentInNewTab } = await import('./launch-agent-in-new-tab')

    expect(
      launchAgentInNewTab({
        requestId: 'profile-refused',
        agent: 'claude',
        worktreeId: 'wt-1',
        agentLaunchProfile: {
          ...claudeWorkProfile,
          ...(remote ? {} : { remoteAgentDirectory: undefined })
        }
      })
    ).toBeNull()
    expect(mockCreateTab).not.toHaveBeenCalled()
  })
})
