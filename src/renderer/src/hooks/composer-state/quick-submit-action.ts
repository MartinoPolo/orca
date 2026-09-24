import { useCallback } from 'react'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { normalizePiAccountPath, type PiLaunchProfile } from '../../../../shared/pi-launch-profiles'
import {
  getValidatedComposerPiProfile,
  isComposerRepoPiProfileTarget
} from '@/lib/composer-pi-profile-target'
import { getLocalDefaultPiAgentDirectory } from '@/lib/pi-profile-resume-provenance'
import { buildQuickComposerStartup } from './quick-startup-plan'
import type { SleepingAgentLaunchConfig } from '../../../../shared/agent-session-resume'
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

function capturedPiAccountDirectory(
  config: SleepingAgentLaunchConfig,
  allowImplicitDefaultDirectory: boolean
): string | null {
  const source = config.agentEnv.ORCA_PI_SOURCE_AGENT_DIR
  const runtime = config.agentEnv.PI_CODING_AGENT_DIR
  const normalizedSource = source ? normalizePiAccountPath(source) : ''
  const normalizedRuntime = runtime ? normalizePiAccountPath(runtime) : ''
  if ((source && !normalizedSource) || (runtime && !normalizedRuntime)) {
    return null
  }
  if (normalizedSource && normalizedSource !== normalizedRuntime) {
    return null
  }
  return (
    normalizedRuntime ||
    (allowImplicitDefaultDirectory
      ? normalizePiAccountPath(getLocalDefaultPiAgentDirectory() ?? '')
      : null) ||
    null
  )
}

function isMatchingPendingPiStartup(
  pendingConfig: SleepingAgentLaunchConfig | undefined,
  selectedConfig: SleepingAgentLaunchConfig | undefined,
  allowImplicitDefaultDirectory: boolean
): boolean {
  if (!pendingConfig?.agentCommand || !selectedConfig?.agentCommand) {
    return false
  }
  const pendingDirectory = capturedPiAccountDirectory(pendingConfig, allowImplicitDefaultDirectory)
  const selectedDirectory = capturedPiAccountDirectory(
    selectedConfig,
    allowImplicitDefaultDirectory
  )
  return Boolean(
    pendingDirectory &&
    pendingDirectory === selectedDirectory &&
    pendingConfig.agentCommand === selectedConfig.agentCommand
  )
}

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
    async (requestedAgent: TuiAgent | null, piProfile?: PiLaunchProfile): Promise<void> => {
      if (isProjectGroupTarget) {
        await submitFolderTarget(requestedAgent, piProfile)
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
        if (
          requestedAgent === 'pi' ||
          liveStore.pendingWorktreeCreations[pendingCreationId]?.request.agent === 'pi'
        ) {
          try {
            const isLocalPiTarget = isComposerRepoPiProfileTarget({
              executionHostId: workspaceRunContext?.hostId ?? selectedRepoExecutionHostId,
              connectionId: selectedRepo.connectionId,
              settings: selectedRepoSettings,
              launchPlatform: selectedRepoAgentLaunchPlatform,
              ephemeralVmRecipeId: ephemeralVmsEnabled ? selectedEphemeralVmRecipeId : null
            })
            const selectedProfile = getValidatedComposerPiProfile(
              piProfile,
              liveStore.settings,
              requestedAgent === 'pi' && isLocalPiTarget
            )
            const pendingRequest = liveStore.pendingWorktreeCreations[pendingCreationId]?.request
            const selectedStartup =
              requestedAgent === 'pi'
                ? buildQuickComposerStartup({
                    agent: 'pi',
                    piProfile: selectedProfile,
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
            if (
              pendingRequest?.agent !== 'pi' ||
              !isMatchingPendingPiStartup(
                pendingRequest.startupPlan?.launchConfig ?? pendingRequest.startup?.launchConfig,
                selectedStartup,
                isLocalPiTarget && !selectedProfile
              )
            ) {
              throw new Error(
                'This linked workspace has a pending creation with a different Pi account. Open that creation to finish or retry it before submitting again.'
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
          piProfile,
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
