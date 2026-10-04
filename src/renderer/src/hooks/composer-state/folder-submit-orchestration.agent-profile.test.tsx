// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import { useAppStore } from '@/store'
import type { FolderWorkspace } from '../../../../shared/folder-workspace-types'
import type { ProjectGroup } from '../../../../shared/project-group-types'
import { useFolderSubmitOrchestration } from './folder-submit-orchestration'

const { activateAndRevealFolderWorkspace } = vi.hoisted(() => ({
  activateAndRevealFolderWorkspace: vi.fn().mockReturnValue(false)
}))
vi.mock('@/lib/worktree-activation', () => ({ activateAndRevealFolderWorkspace }))
vi.mock('@/lib/agent-trust-preflight', () => ({
  preflightAgentTrust: vi.fn().mockResolvedValue(true)
}))

const profile = {
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
const group: ProjectGroup = {
  id: 'group-1',
  name: 'Group',
  parentPath: '/projects',
  parentGroupId: null,
  createdFrom: 'manual',
  tabOrder: 0,
  isCollapsed: false,
  color: null,
  createdAt: 0,
  updatedAt: 0,
  executionHostId: 'local'
}
const sshGroup: ProjectGroup = {
  ...group,
  parentPath: '/home/agent/projects',
  connectionId: 'ssh-1',
  executionHostId: 'ssh:ssh-1'
}
const workspace: FolderWorkspace = {
  id: 'folder-1',
  projectGroupId: group.id,
  name: 'workspace',
  folderPath: '/projects/workspace',
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

function setup(selectedProjectGroup: ProjectGroup = group) {
  const createFolderWorkspace = vi.fn().mockResolvedValue(workspace)
  const onCreated = vi.fn()
  const setCreateError = vi.fn()
  const isRemote = Boolean(selectedProjectGroup.connectionId)
  const hook = renderHook(() =>
    useFolderSubmitOrchestration({
      clearNewWorkspaceDraft: vi.fn(),
      createFolderWorkspace,
      decisions: { canResolveFolderSmartGitHubSubmit: () => false },
      disabledTuiAgents: [],
      folderCreateDisabled: false,
      folderSourceRepos: [],
      folderTargetConnectionId: selectedProjectGroup.connectionId ?? null,
      folderTargetIsRemote: isRemote,
      folderTargetRuntimeEnvironmentId: null,
      isSubmissionCancelled: () => false,
      lastAutoNameRef: { current: '' },
      linkedWorkItem: null,
      name: 'workspace',
      note: '',
      onCreated,
      persistDraft: false,
      resolvePendingSmartGitHubSubmit: vi.fn(),
      selectedProjectGroup,
      setCreateError,
      setCreating: vi.fn(),
      settings: getDefaultSettings('/tmp'),
      taskSourceContext: null,
      telemetrySource: 'sidebar'
    })
  )
  return { hook, createFolderWorkspace, onCreated, setCreateError }
}

beforeEach(() => {
  activateAndRevealFolderWorkspace.mockClear()
  useAppStore.setState({
    settings: {
      ...getDefaultSettings('/tmp'),
      piLaunchProfiles: [profile],
      claudeLaunchProfiles: [claudeProfile]
    },
    sshConnectionStates: new Map([
      [
        'ssh-1',
        {
          targetId: 'ssh-1',
          status: 'connected',
          error: null,
          reconnectAttempt: 0,
          remoteHomeDirectory: '/home/agent'
        }
      ]
    ])
  })
})

describe('folder creation profile submission', () => {
  it('launches the created folder with the selected account and concrete command', async () => {
    const { hook, createFolderWorkspace } = setup()
    await act(async () => hook.result.current.submitFolderTarget('pi', profile))
    expect(createFolderWorkspace).toHaveBeenCalledOnce()
    expect(activateAndRevealFolderWorkspace).toHaveBeenCalledWith(
      'folder-1',
      expect.objectContaining({
        startup: expect.objectContaining({
          launchConfig: expect.objectContaining({
            agentCommand: '/tools/piw',
            agentEnv: expect.objectContaining({ PI_CODING_AGENT_DIR: '/accounts/work' })
          })
        })
      })
    )
  })

  it('launches an SSH folder under the profile root inside the remote home', async () => {
    const { hook, createFolderWorkspace } = setup(sshGroup)
    await act(async () =>
      hook.result.current.submitFolderTarget('claude', {
        ...claudeProfile,
        agentDirectory: '/home/agent/.claude-work'
      })
    )
    expect(createFolderWorkspace).toHaveBeenCalledOnce()
    expect(activateAndRevealFolderWorkspace).toHaveBeenCalledWith(
      'folder-1',
      expect.objectContaining({
        startup: expect.objectContaining({
          launchConfig: expect.objectContaining({
            agentCommand: expect.stringMatching(/^ccw /),
            agentEnv: expect.objectContaining({ CLAUDE_CONFIG_DIR: '/home/agent/.claude-work' })
          })
        })
      })
    )
  })

  it('rejects a profile without a root on the selected host before creating a folder', async () => {
    const { hook, createFolderWorkspace, onCreated, setCreateError } = setup(sshGroup)
    await act(async () => hook.result.current.submitFolderTarget('pi', profile))
    expect(createFolderWorkspace).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
    expect(setCreateError).toHaveBeenCalled()
  })
})
