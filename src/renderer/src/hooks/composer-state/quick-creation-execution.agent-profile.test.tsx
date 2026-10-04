// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import { useAppStore } from '@/store'
import type { PreparedQuickSubmit } from './composer-submit-model'
import type { QuickCreationExecutionInput } from './quick-creation-execution-input'
import { useQuickCreationExecution } from './quick-creation-execution'
import { useQuickSubmitAction } from './quick-submit-action'

const { runBackgroundWorktreeCreation } = vi.hoisted(() => ({
  runBackgroundWorktreeCreation: vi.fn()
}))
vi.mock('@/lib/worktree-creation-flow', () => ({ runBackgroundWorktreeCreation }))

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
const repo = {
  id: 'repo-1',
  path: '/repos/repo-1',
  displayName: 'Repo',
  badgeColor: '#000000',
  addedAt: 0
}
const prepared: PreparedQuickSubmit = {
  submitLinkedWorkItem: null,
  agent: 'pi',
  submitLinkedIssueNumber: null,
  submitLinkedPR: null,
  submitTitleName: null,
  nameIsAutoManaged: false,
  smartGitHubCreateNames: { workspaceName: 'workspace', displayName: undefined },
  workspaceName: 'workspace',
  nameWasGenerated: false,
  smartSubmitBaseBranch: undefined,
  submitCompareBaseRef: undefined,
  submitPushTarget: undefined,
  submitBranchNameOverride: undefined,
  effectiveSetupDecision: 'inherit',
  issueCommand: undefined,
  linkedLinearIssue: undefined,
  linkedLinearIssueWorkspaceId: undefined,
  linkedLinearIssueOrganizationUrlKey: undefined,
  effectiveBranchNameOverride: undefined,
  submitBaseBranch: undefined,
  createDisplayName: undefined,
  pendingFirstAgentMessageRename: false,
  trimmedNote: ''
}

function createInput(
  overrides: Partial<QuickCreationExecutionInput> = {}
): QuickCreationExecutionInput {
  return {
    clearNewWorkspaceDraft: vi.fn(),
    createMultiple: false,
    effectivePresetId: null,
    ephemeralVmRecipes: [],
    ephemeralVmsEnabled: false,
    isSubmissionCancelled: () => false,
    linkedGitLabIssue: null,
    linkedGitLabMR: null,
    normalizedSparseDirectories: [],
    onCreated: vi.fn(),
    parentWorktreeId: null,
    persistDraft: false,
    persistSetupAgentStartupPolicy: vi.fn().mockResolvedValue(true),
    prepareQuickSubmit: vi.fn().mockResolvedValue(prepared),
    resetForNextCreate: vi.fn(),
    resolvedInitialWorkspaceStatus: undefined,
    selectedEphemeralVmRecipeId: null,
    selectedRepoAgentLaunchPlatform: 'linux',
    selectedRepoExecutionHostId: 'local',
    selectedRepoIsGit: true,
    selectedRepoIsRemote: false,
    selectedRepoSettings: null,
    selectedRepoStartupShell: undefined,
    selectedWorkspaceTarget: { status: 'unavailable', reason: 'no-eligible-repo' },
    settings: getDefaultSettings('/tmp'),
    sparseEnabled: false,
    taskSourceContext: null,
    telemetrySource: 'sidebar',
    ...overrides
  }
}

beforeEach(() => {
  runBackgroundWorktreeCreation.mockClear()
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

describe('quick creation profile submission', () => {
  it('captures the submitted Pi command and account in the pending creation request', async () => {
    const input = createInput()
    const hook = renderHook(() => {
      const execution = useQuickCreationExecution(input)
      return useQuickSubmitAction({
        effectiveLinkedPR: null,
        ephemeralVmsEnabled: false,
        selectedEphemeralVmRecipeId: null,
        executeQuickCreation: execution.executeQuickCreation,
        fallbackCreatureName: 'fallback',
        isProjectGroupTarget: false,
        isSubmissionCancelled: () => false,
        linkedPR: null,
        name: 'workspace',
        onCreated: vi.fn(),
        parsedLinkedIssueNumber: null,
        repoId: repo.id,
        requiresExplicitSetupChoice: false,
        resolvePendingSmartGitHubSubmit: vi.fn().mockResolvedValue({ kind: 'none' }),
        selectedRepo: repo,
        selectedRepoRequiresConnection: false,
        selectedRepoAgentLaunchPlatform: 'linux',
        selectedRepoExecutionHostId: 'local',
        selectedRepoIsRemote: false,
        selectedRepoSettings: null,
        selectedRepoStartupShell: undefined,
        selectedWorkspaceTarget: { status: 'unavailable', reason: 'no-eligible-repo' },
        settings: input.settings,
        setCreateError: vi.fn(),
        setCreating: vi.fn(),
        setupDecision: 'run',
        showProjectRequiredError: vi.fn(),
        sourceIntentBlocksCreate: false,
        sparseError: null,
        submitFolderTarget: vi.fn()
      })
    })
    await act(async () => hook.result.current.submitQuick('pi', profile))
    expect(runBackgroundWorktreeCreation).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'pi',
        startupPlan: expect.objectContaining({
          launchConfig: expect.objectContaining({
            agentCommand: '/tools/piw',
            agentEnv: expect.objectContaining({
              PI_CODING_AGENT_DIR: '/accounts/work',
              ORCA_PI_SOURCE_AGENT_DIR: '/accounts/work'
            })
          })
        })
      })
    )
  })

  it('captures a Claude profile root inside the SSH host home', async () => {
    const sshRepo = { ...repo, connectionId: 'ssh-1', path: '/home/agent/repo' }
    const hook = renderHook(() =>
      useQuickCreationExecution(
        createInput({
          prepareQuickSubmit: vi.fn().mockResolvedValue({ ...prepared, agent: 'claude' }),
          selectedRepoExecutionHostId: 'ssh:ssh-1',
          selectedRepoIsRemote: true
        })
      )
    )
    await act(async () =>
      hook.result.current.executeQuickCreation(
        { kind: 'none' },
        'claude',
        { ...claudeProfile, agentDirectory: '/home/agent/.claude-work' },
        'workspace',
        null,
        sshRepo.id,
        sshRepo
      )
    )
    expect(runBackgroundWorktreeCreation).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'claude',
        startupPlan: expect.objectContaining({
          launchConfig: expect.objectContaining({
            agentCommand: expect.stringMatching(/^ccw /),
            agentEnv: expect.objectContaining({ CLAUDE_CONFIG_DIR: '/home/agent/.claude-work' })
          })
        })
      })
    )
  })

  it('refuses a stale selected profile before creating a worktree', async () => {
    const hook = renderHook(() => useQuickCreationExecution(createInput()))
    useAppStore.setState({ settings: { ...getDefaultSettings('/tmp'), piLaunchProfiles: [] } })
    await expect(
      hook.result.current.executeQuickCreation(
        { kind: 'none' },
        'pi',
        profile,
        'workspace',
        null,
        repo.id,
        repo
      )
    ).rejects.toThrow('unavailable')
    expect(runBackgroundWorktreeCreation).not.toHaveBeenCalled()
  })
})
