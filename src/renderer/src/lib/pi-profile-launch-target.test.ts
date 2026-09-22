import { describe, expect, it } from 'vitest'
import { getDefaultSettings } from '../../../shared/constants'
import { resolvePiProfileLaunchTarget } from './pi-profile-launch-target'

function localProjectState() {
  return {
    settings: getDefaultSettings('/tmp'),
    repos: [{ id: 'repo-1', connectionId: null, path: '/repo' }],
    projects: [
      {
        id: 'repo-1',
        localWindowsRuntimePreference: { kind: 'wsl' as const, distro: 'Ubuntu' }
      }
    ],
    worktreesByRepo: {
      'repo-1': [{ id: 'wt-1', repoId: 'repo-1', path: '/repo/worktree' }]
    },
    folderWorkspaces: [],
    projectGroups: [],
    activeRepoId: 'repo-1',
    activeWorktreeId: 'wt-1'
  }
}

function resolveTarget(state: unknown, worktreeId: string, platform: NodeJS.Platform) {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The focused fixture supplies every state slice read by the resolver.
  return resolvePiProfileLaunchTarget(state as never, worktreeId, { platform })
}

describe('Pi profile launch target', () => {
  it.each(['linux', 'darwin'] as const)(
    'ignores persisted Windows WSL preferences on %s',
    (platform) => {
      expect(resolveTarget(localProjectState(), 'wt-1', platform)).toBe('local-native')
    }
  )

  it('classifies the same persisted WSL preference as non-local on Windows', () => {
    expect(resolveTarget(localProjectState(), 'wt-1', 'win32')).toBe('non-local')
  })

  it('rejects a local Windows folder whose path is a WSL UNC path', () => {
    const state = {
      ...localProjectState(),
      folderWorkspaces: [
        {
          id: 'folder-1',
          projectGroupId: 'group-1',
          name: 'WSL folder',
          folderPath: '\\\\wsl.localhost\\Ubuntu\\home\\ada\\repo',
          connectionId: null,
          executionHostId: 'local' as const,
          linkedTask: null,
          comment: '',
          isArchived: false,
          isUnread: false,
          isPinned: false,
          sortOrder: 0,
          lastActivityAt: 0,
          createdAt: 0,
          updatedAt: 0
        }
      ]
    }

    expect(resolveTarget(state, 'folder:folder-1', 'win32')).toBe('non-local')
  })

  it('keeps a missing workspace catalog unresolved even with no remote settings', () => {
    const state = localProjectState()
    state.repos = []

    expect(resolveTarget(state, 'wt-1', 'win32')).toBe('unresolved')
  })
})
