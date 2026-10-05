import { useCallback } from 'react'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { AgentLaunchProfile } from '../../../../shared/agent-launch-profiles'
import { AGENT_LAUNCH_PROFILE_AGENTS } from '../../../../shared/agent-launch-profile-agents'
import {
  isMatchingPendingAccountStartup,
  resolvePendingAccountAgent
} from './pending-account-startup'
import {
  getValidatedComposerAgentProfile,
  resolveComposerRepoProfileHostScope
} from '@/lib/composer-agent-profile-target'
import { buildQuickComposerStartup } from './quick-startup-plan'
import type { WorktreeCreationRequest } from '@/lib/pending-worktree-creation'
import { findPendingLinkedWorkItemCreationId } from '@/lib/pending-worktree-creation'
import { useAppStore } from '@/store'
import { getWorkspaceSeedName } from '@/lib/new-workspace'
import { settleComposerSubmit } from '@/lib/composer-submit-cancellation'
import {
  formatWorkspaceCreateError,
  getWorkspaceCreateErrorToastMessage
} from '@/lib/workspace-create-error-format'
import { toast } from 'sonner'

import type { ComposerModel } from './composer-model'

type QuickSubmitActionInput = Pick<
  ComposerModel,
  | 'effectiveLinkedPR'
  | 'ephemeralVmsEnabled'
  | 'selectedEphemeralVmRecipeId'
  | 'selectedRepoAgentLaunchPlatform'
  | 'selectedRepoExecutionHostId'
  | 'selectedRepoIsRemote'
  | 'selectedRepoSettings'
  | 'selectedRepoStartupShell'
  | 'settings'
  | 'executeQuickCreation'
  | 'fallbackCreatureName'
  | 'isProjectGroupTarget'
  | 'isSubmissionCancelled'
  | 'linkedPR'
  | 'name'
  | 'onCreated'
  | 'parsedLinkedIssueNumber'
  | 'repoId'
  | 'requiresExplicitSetupChoice'
  | 'resolvePendingSmartGitHubSubmit'
  | 'selectedRepo'
  | 'selectedRepoRequiresConnection'
  | 'selectedWorkspaceTarget'
  | 'setCreateError'
  | 'setCreating'
  | 'setupDecision'
  | 'showProjectRequiredError'
  | 'sourceIntentBlocksCreate'
  | 'sparseError'
  | 'submitFolderTarget'
>

export function useQuickSubmitAction(input: QuickSubmitActionInput) {
  const {
    effectiveLinkedPR,
    ephemeralVmsEnabled,
    executeQuickCreation,
    fallbackCreatureName,
    isProjectGroupTarget,
    isSubmissionCancelled,
    linkedPR,
    name,
    onCreated,
    parsedLinkedIssueNumber,
    repoId,
    requiresExplicitSetupChoice,
    resolvePendingSmartGitHubSubmit,
    selectedRepo,
    selectedRepoRequiresConnection,
    selectedRepoAgentLaunchPlatform,
    selectedRepoExecutionHostId,
    selectedRepoIsRemote,
    selectedRepoSettings,
    selectedRepoStartupShell,
    selectedEphemeralVmRecipeId,
    selectedWorkspaceTarget,
    settings,
    setCreateError,
    setCreating,
    setupDecision,
    showProjectRequiredError,
    sourceIntentBlocksCreate,
    sparseError,
    submitFolderTarget
  } = input

  const submitQuick = useCallback(
    async (requestedAgent: TuiAgent | null, agentProfile?: AgentLaunchProfile): Promise<void> => {
      if (isProjectGroupTarget) {
        await submitFolderTarget(requestedAgent, agentProfile)
        return
      }

      const workspaceNameSeed = getWorkspaceSeedName({
        explicitName: name,
        prompt: '',
        linkedIssueNumber: parsedLinkedIssueNumber,
        linkedPR,
        fallbackName: fallbackCreatureName
      })

      if (!repoId || !selectedRepo) {
        showProjectRequiredError()
        return
      }

      if (
        !workspaceNameSeed ||
        sourceIntentBlocksCreate ||
        selectedRepoRequiresConnection ||
        (requiresExplicitSetupChoice && !setupDecision) ||
        sparseError !== null
      ) {
        return
      }

      const workspaceRunContext: WorktreeCreationRequest['workspaceRunContext'] =
        selectedWorkspaceTarget.status === 'ready'
          ? {
              kind: 'workspace-run',
              projectId: selectedWorkspaceTarget.target.projectId,
              hostId: selectedWorkspaceTarget.target.hostId,
              projectHostSetupId: selectedWorkspaceTarget.target.projectHostSetupId,
              repoId: selectedWorkspaceTarget.target.repoId,
              path: selectedWorkspaceTarget.target.repo.path
            }
          : null

      const liveStore = useAppStore.getState()

      const pendingCreationId = findPendingLinkedWorkItemCreationId(
        liveStore.pendingWorktreeCreations,
        {
          repoId,
          ...(parsedLinkedIssueNumber != null ? { linkedIssue: parsedLinkedIssueNumber } : {}),
          ...(effectiveLinkedPR != null ? { linkedPR: effectiveLinkedPR } : {}),
          workspaceRunContext
        }
      )

      if (pendingCreationId) {
        const pendingRequest = liveStore.pendingWorktreeCreations[pendingCreationId]?.request
        const pendingAgent = pendingRequest?.agent
        const pendingConfig =
          pendingRequest?.startupPlan?.launchConfig ?? pendingRequest?.startup?.launchConfig
        const accountAgent = resolvePendingAccountAgent(
          requestedAgent,
          Boolean(agentProfile),
          pendingAgent,
          pendingConfig
        )
        if (accountAgent) {
          try {
            const scope = resolveComposerRepoProfileHostScope({
              executionHostId: workspaceRunContext?.hostId ?? selectedRepoExecutionHostId,
              connectionId: selectedRepo.connectionId,
              settings: selectedRepoSettings,
              launchPlatform: selectedRepoAgentLaunchPlatform,
              ephemeralVmRecipeId: ephemeralVmsEnabled ? selectedEphemeralVmRecipeId : null,
              sshConnectionStates: liveStore.sshConnectionStates
            })
            const selectedProfile = getValidatedComposerAgentProfile(
              requestedAgent,
              agentProfile,
              liveStore.settings,
              scope
            )
            const selectedStartup =
              requestedAgent === accountAgent
                ? buildQuickComposerStartup({
                    agent: accountAgent,
                    agentProfile: selectedProfile,
                    prompt: '',
                    draftPrompt: null,
                    settings,
                    repoConnectionId: selectedRepo.connectionId,
                    platform: selectedRepoAgentLaunchPlatform,
                    shell: selectedRepoStartupShell,
                    isRemote: selectedRepoIsRemote,
                    telemetrySource: undefined
                  }).startupPlan?.launchConfig
                : undefined
            const implicitDefaultDirectory =
              scope && !selectedProfile
                ? AGENT_LAUNCH_PROFILE_AGENTS[accountAgent].getDefaultAgentDirectory(
                    scope.homeDirectory
                  )
                : undefined
            if (
              pendingAgent !== accountAgent ||
              !isMatchingPendingAccountStartup(
                accountAgent,
                pendingConfig,
                selectedStartup,
                implicitDefaultDirectory
              )
            ) {
              throw new Error(
                `This linked workspace has a pending creation with a different ${AGENT_LAUNCH_PROFILE_AGENTS[accountAgent].label} account. Open that creation to finish or retry it before submitting again.`
              )
            }
          } catch (error) {
            const formattedError = formatWorkspaceCreateError(error)
            setCreateError(formattedError)
            toast.error(getWorkspaceCreateErrorToastMessage(formattedError))
            return
          }
        }
        liveStore.setActivePendingWorktreeCreation(pendingCreationId)
        liveStore.setActiveView('terminal')
        liveStore.setSidebarOpen(true)
        onCreated?.()
        return
      }

      setCreateError(null)

      setCreating(true)
      try {
        const smartGitHubSettlement = await settleComposerSubmit(
          resolvePendingSmartGitHubSubmit(),
          isSubmissionCancelled
        )
        if (smartGitHubSettlement.status === 'cancelled') {
          return
        }
        await executeQuickCreation(
          smartGitHubSettlement.value,
          requestedAgent,
          agentProfile,
          workspaceNameSeed,
          workspaceRunContext,
          repoId,
          selectedRepo
        )
      } catch (error) {
        if (isSubmissionCancelled()) {
          return
        }
        const formattedError = formatWorkspaceCreateError(error)
        setCreateError(formattedError)
        toast.error(getWorkspaceCreateErrorToastMessage(formattedError))
      } finally {
        setCreating(false)
      }
    },
    [
      effectiveLinkedPR,
      ephemeralVmsEnabled,
      executeQuickCreation,
      fallbackCreatureName,
      isProjectGroupTarget,
      isSubmissionCancelled,
      linkedPR,
      name,
      onCreated,
      parsedLinkedIssueNumber,
      repoId,
      requiresExplicitSetupChoice,
      resolvePendingSmartGitHubSubmit,
      selectedRepo,
      selectedRepoRequiresConnection,
      selectedRepoAgentLaunchPlatform,
      selectedRepoExecutionHostId,
      selectedRepoIsRemote,
      selectedRepoSettings,
      selectedRepoStartupShell,
      selectedEphemeralVmRecipeId,
      selectedWorkspaceTarget,
      settings,
      setCreateError,
      setCreating,
      setupDecision,
      showProjectRequiredError,
      sourceIntentBlocksCreate,
      sparseError,
      submitFolderTarget
    ]
  )

  return { submitQuick }
}
