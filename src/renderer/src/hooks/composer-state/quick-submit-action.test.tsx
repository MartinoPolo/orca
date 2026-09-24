// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../../../shared/constants'
import type { PendingWorktreeCreation } from '@/lib/pending-worktree-creation'
import type { PiLaunchProfile } from '../../../../shared/pi-launch-profiles'
import { useQuickSubmitAction } from './quick-submit-action'

const profile: PiLaunchProfile = {
  id: 'work',
  name: 'piw',
  command: '/tools/piw',
  agentDirectory: '/accounts/work'
}
const repo = {
  id: 'repo-1',
  path: '/repos/repo-1',
  displayName: 'Repo',
  badgeColor: '#000000',
  addedAt: 0
}
const pending = (command: string, directory?: string): PendingWorktreeCreation => ({
  creationId: 'pending-1',
  phase: 'preparing',
  status: 'creating',
  startedAt: 0,
  indeterminate: false,
  loaderVisible: true,
  request: {
    repoId: 'repo-1',
    name: 'issue-42',
    linkedIssue: 42,
    setupDecision: 'inherit',
    agent: 'pi',
    pendingFirstAgentMessageRename: false,
    note: '',
    quickPrompt: '',
    quickTelemetry: null,
    startupPlan: null,
    startup: {
      command,
      launchConfig: {
        agentCommand: command,
        agentArgs: '',
        agentEnv: directory
          ? { PI_CODING_AGENT_DIR: directory, ORCA_PI_SOURCE_AGENT_DIR: directory }
          : {}
      }
    }
  }
})

afterEach(() => vi.unstubAllGlobals())

beforeEach(() => {
  useAppStore.setState({
    settings: { ...getDefaultSettings('/tmp'), piLaunchProfiles: [profile] },
    pendingWorktreeCreations: {},
    setActivePendingWorktreeCreation: vi.fn(),
    setActiveView: vi.fn(),
    setSidebarOpen: vi.fn()
  })
})

function setup() {
  const input = {
    effectiveLinkedPR: null,
    ephemeralVmsEnabled: false,
    executeQuickCreation: vi.fn(),
    fallbackCreatureName: 'fallback',
    isProjectGroupTarget: false,
    isSubmissionCancelled: () => false,
    linkedPR: null,
    name: 'issue-42',
    onCreated: vi.fn(),
    parsedLinkedIssueNumber: 42,
    repoId: 'repo-1',
    requiresExplicitSetupChoice: false,
    resolvePendingSmartGitHubSubmit: vi.fn().mockResolvedValue({ kind: 'none' as const }),
    selectedRepo: repo,
    selectedRepoRequiresConnection: false,
    selectedRepoAgentLaunchPlatform: 'linux' as const,
    selectedRepoExecutionHostId: 'local' as const,
    selectedRepoIsRemote: false,
    selectedRepoSettings: null,
    selectedRepoStartupShell: undefined,
    selectedEphemeralVmRecipeId: null,
    selectedWorkspaceTarget: {
      status: 'unavailable' as const,
      reason: 'no-eligible-repo' as const
    },
    settings: useAppStore.getState().settings,
    setCreateError: vi.fn(),
    setCreating: vi.fn(),
    setupDecision: 'run' as const,
    showProjectRequiredError: vi.fn(),
    sourceIntentBlocksCreate: false,
    sparseError: null,
    submitFolderTarget: vi.fn()
  }
  const hook = renderHook(() => useQuickSubmitAction(input))
  return { input, hook }
}

describe('quick linked-work-item pending reuse', () => {
  it('refuses a personal pending Pi creation when a named profile was selected', async () => {
    useAppStore.setState({ pendingWorktreeCreations: { 'pending-1': pending('pi') } })
    const { input, hook } = setup()
    await act(async () => hook.result.current.submitQuick('pi', profile))
    expect(input.setCreateError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('different Pi account')
      })
    )
    expect(input.executeQuickCreation).not.toHaveBeenCalled()
    expect(input.onCreated).not.toHaveBeenCalled()
    expect(useAppStore.getState().setActivePendingWorktreeCreation).not.toHaveBeenCalled()
  })

  it('refuses a source-only pending Pi snapshot even with the same command and account', async () => {
    const entry = pending('/tools/piw', '/accounts/work')
    delete entry.request.startup?.launchConfig?.agentEnv.PI_CODING_AGENT_DIR
    useAppStore.setState({ pendingWorktreeCreations: { 'pending-1': entry } })
    const { input, hook } = setup()
    await act(async () => hook.result.current.submitQuick('pi', profile))
    expect(input.setCreateError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('different Pi account') })
    )
    expect(input.onCreated).not.toHaveBeenCalled()
    expect(useAppStore.getState().setActivePendingWorktreeCreation).not.toHaveBeenCalled()
  })

  it('refuses an env-less pending Pi snapshot for a named profile targeting the default directory', async () => {
    vi.stubGlobal('api', { platform: { get: () => ({ homeDirectory: '/tmp' }) } })
    const defaultDirectoryProfile = {
      ...profile,
      command: 'pi',
      agentDirectory: '/tmp/.pi/agent'
    }
    useAppStore.setState({
      settings: { ...getDefaultSettings('/tmp'), piLaunchProfiles: [defaultDirectoryProfile] },
      pendingWorktreeCreations: { 'pending-1': pending('pi') }
    })
    const { input, hook } = setup()
    await act(async () => hook.result.current.submitQuick('pi', defaultDirectoryProfile))
    expect(input.setCreateError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('different Pi account') })
    )
    expect(input.onCreated).not.toHaveBeenCalled()
    expect(useAppStore.getState().setActivePendingWorktreeCreation).not.toHaveBeenCalled()
  })

  it('reuses an env-less local built-in Pi pending creation', async () => {
    vi.stubGlobal('api', { platform: { get: () => ({ homeDirectory: '/tmp' }) } })
    useAppStore.setState({ pendingWorktreeCreations: { 'pending-1': pending('pi') } })
    const { input, hook } = setup()
    await act(async () => hook.result.current.submitQuick('pi'))
    expect(input.onCreated).toHaveBeenCalledOnce()
    expect(input.setCreateError).not.toHaveBeenCalled()
  })

  it('reuses only the same captured Pi command and normalized account', async () => {
    useAppStore.setState({
      pendingWorktreeCreations: { 'pending-1': pending('/tools/piw', '/accounts/work/') }
    })
    const { input, hook } = setup()
    await act(async () => hook.result.current.submitQuick('pi', profile))
    expect(input.onCreated).toHaveBeenCalledOnce()
    expect(input.setCreateError).not.toHaveBeenCalled()
  })

  it('reuses only the same captured Pi command and account', async () => {
    useAppStore.setState({
      pendingWorktreeCreations: { 'pending-1': pending('/tools/piw', '/accounts/work') }
    })
    const { input, hook } = setup()
    await act(async () => hook.result.current.submitQuick('pi', profile))
    expect(input.onCreated).toHaveBeenCalledOnce()
    expect(useAppStore.getState().setActivePendingWorktreeCreation).toHaveBeenCalledWith(
      'pending-1'
    )
    expect(input.executeQuickCreation).not.toHaveBeenCalled()
  })

  it('refuses a pending Pi snapshot whose source conflicts with its runtime directory', async () => {
    const entry = pending('/tools/piw', '/accounts/work')
    if (entry.request.startup?.launchConfig) {
      entry.request.startup.launchConfig.agentEnv.ORCA_PI_SOURCE_AGENT_DIR = '/accounts/personal'
    }
    useAppStore.setState({ pendingWorktreeCreations: { 'pending-1': entry } })
    const { input, hook } = setup()
    await act(async () => hook.result.current.submitQuick('pi', profile))
    expect(input.setCreateError).toHaveBeenCalled()
    expect(input.onCreated).not.toHaveBeenCalled()
  })

  it('refuses a pending Pi creation with the same command but a different account', async () => {
    useAppStore.setState({
      pendingWorktreeCreations: { 'pending-1': pending('/tools/piw', '/accounts/personal') }
    })
    const { input, hook } = setup()
    await act(async () => hook.result.current.submitQuick('pi', profile))
    expect(input.setCreateError).toHaveBeenCalled()
    expect(input.onCreated).not.toHaveBeenCalled()
  })

  it('refuses a named pending Pi creation when default Pi was selected', async () => {
    useAppStore.setState({
      pendingWorktreeCreations: { 'pending-1': pending('/tools/piw', '/accounts/work') }
    })
    const { input, hook } = setup()
    await act(async () => hook.result.current.submitQuick('pi'))
    expect(input.setCreateError).toHaveBeenCalled()
    expect(input.onCreated).not.toHaveBeenCalled()
  })

  it('refuses reuse when the captured startup has no provable command', async () => {
    const entry = pending('/tools/piw', '/accounts/work')
    entry.request.startup = undefined
    useAppStore.setState({ pendingWorktreeCreations: { 'pending-1': entry } })
    const { input, hook } = setup()
    await act(async () => hook.result.current.submitQuick('pi', profile))
    expect(input.setCreateError).toHaveBeenCalled()
    expect(input.onCreated).not.toHaveBeenCalled()
  })

  it('keeps non-Pi linked dedup unchanged', async () => {
    const entry = pending('claude')
    entry.request.agent = 'claude'
    useAppStore.setState({ pendingWorktreeCreations: { 'pending-1': entry } })
    const { input, hook } = setup()
    await act(async () => hook.result.current.submitQuick('claude'))
    expect(input.onCreated).toHaveBeenCalledOnce()
    expect(input.setCreateError).not.toHaveBeenCalled()
  })

  it('rejects a deleted selected profile before reusing a pending creation', async () => {
    useAppStore.setState({
      pendingWorktreeCreations: { 'pending-1': pending('/tools/piw', '/accounts/work') },
      settings: { ...getDefaultSettings('/tmp'), piLaunchProfiles: [] }
    })
    const { input, hook } = setup()
    await act(async () => hook.result.current.submitQuick('pi', profile))
    expect(input.setCreateError).toHaveBeenCalled()
    expect(input.onCreated).not.toHaveBeenCalled()
  })
})
