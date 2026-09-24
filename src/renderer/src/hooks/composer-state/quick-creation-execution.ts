import type { QuickCreationExecutionInput } from './quick-creation-execution-input'

import { useCallback } from 'react'
import type { Repo } from '../../../../shared/repo-types'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { PiLaunchProfile } from '../../../../shared/pi-launch-profiles'
import {
  getValidatedComposerPiProfile,
  isComposerRepoPiProfileTarget
} from '@/lib/composer-pi-profile-target'
import type { WorktreeCreationRequest } from '@/lib/pending-worktree-creation'
import { useAppStore } from '@/store'
import { settleComposerSubmit } from '@/lib/composer-submit-cancellation'
import { ensureHooksConfirmed } from '@/lib/ensure-hooks-confirmed'
import { getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { runBackgroundWorktreeCreation } from '@/lib/worktree-creation-flow'
import { translate } from '@/i18n/i18n'
import { resolveQuickCreateLinkedWorkItemPrompt } from '@/lib/linked-work-item-context'
import { buildQuickComposerStartup } from './quick-startup-plan'
import { buildQuickCreationRequest } from './quick-creation-request'
import type { PendingSmartGitHubSubmitResolution } from './source-selection-decisions'
import { planAgentSessionLaunch } from '@/lib/agent-session-launch-plan'

export function useQuickCreationExecution(input: QuickCreationExecutionInput) {
  const {
    clearNewWorkspaceDraft,
    createMultiple,
    effectivePresetId,
    ephemeralVmRecipes,
    ephemeralVmsEnabled,
    isSubmissionCancelled,
    linkedGitLabIssue,
    linkedGitLabMR,
    normalizedSparseDirectories,
    onCreated,
    parentWorktreeId,
    persistDraft,
    persistSetupAgentStartupPolicy,
    prepareQuickSubmit,
    resetForNextCreate,
    resolvedInitialWorkspaceStatus,
    selectedEphemeralVmRecipeId,
    selectedRepoAgentLaunchPlatform,
    selectedRepoExecutionHostId,
    selectedRepoIsGit,
    selectedRepoIsRemote,
    selectedRepoSettings,
    selectedRepoStartupShell,
    selectedWorkspaceTarget,
    settings,
    sparseEnabled,
    taskSourceContext,
    telemetrySource
  } = input

  const executeQuickCreation = useCallback(
    async (
      smartGitHubResolution: PendingSmartGitHubSubmitResolution,
      requestedAgent: TuiAgent | null,
      piProfile: PiLaunchProfile | undefined,
      workspaceNameSeed: string,
      workspaceRunContext: WorktreeCreationRequest['workspaceRunContext'],
      repoId: string,
      selectedRepo: Repo
    ): Promise<void> => {
      const selectedProfile = getValidatedComposerPiProfile(
        piProfile,
        useAppStore.getState().settings,
        requestedAgent === 'pi' &&
          isComposerRepoPiProfileTarget({
            executionHostId: workspaceRunContext?.hostId ?? selectedRepoExecutionHostId,
            connectionId: selectedRepo.connectionId,
            settings: selectedRepoSettings,
            launchPlatform: selectedRepoAgentLaunchPlatform,
            ephemeralVmRecipeId: ephemeralVmsEnabled ? selectedEphemeralVmRecipeId : null
          })
      )
      const prepared = await prepareQuickSubmit(
        smartGitHubResolution,
        requestedAgent,
        workspaceNameSeed
      )

      if (!prepared) {
        return
      }

      const {
        submitLinkedWorkItem,
        agent,
        submitLinkedIssueNumber,
        submitLinkedPR,
        workspaceName,
        nameWasGenerated,
        nameIsAutoManaged,
        submitCompareBaseRef,
        submitPushTarget,
        effectiveSetupDecision,
        issueCommand,
        linkedLinearIssue,
        linkedLinearIssueWorkspaceId,
        linkedLinearIssueOrganizationUrlKey,
        effectiveBranchNameOverride,
        submitBaseBranch,
        createDisplayName,
        pendingFirstAgentMessageRename,
        trimmedNote
      } = prepared

      if (selectedProfile && agent !== 'pi') {
        throw new Error(
          'Pi is no longer available. Select another agent before creating the workspace.'
        )
      }
      const promptLinkedWorkItem = agent === null ? null : submitLinkedWorkItem

      const { prompt: quickPrompt, draftPrompt: quickDraftPrompt } =
        resolveQuickCreateLinkedWorkItemPrompt(
          promptLinkedWorkItem,
          trimmedNote,
          agent ? settings?.agentLinkedWorkItemPromptTemplates?.[agent] : undefined
        )

      const {
        startupPlan,
        backendStartup,
        telemetry: quickTelemetry
      } = buildQuickComposerStartup({
        agent,
        piProfile: selectedProfile,
        prompt: quickPrompt,
        draftPrompt: quickDraftPrompt,
        settings,
        repoConnectionId: selectedRepo.connectionId,
        platform: selectedRepoAgentLaunchPlatform,
        shell: selectedRepoStartupShell,
        isRemote: selectedRepoIsRemote,
        telemetrySource
      })

      const startupPolicySettlement = await settleComposerSubmit(
        persistSetupAgentStartupPolicy(),
        isSubmissionCancelled
      )

      if (startupPolicySettlement.status === 'cancelled') {
        return
      }

      if (!startupPolicySettlement.value) {
        throw new Error(
          translate(
            'auto.hooks.useComposerState.setupAgentStartupPolicySaveFailed',
            'Failed to save setup startup behavior.'
          )
        )
      }

      let ephemeralVmRecipe: WorktreeCreationRequest['ephemeralVmRecipe']

      const activeEphemeralVmRecipeId = ephemeralVmsEnabled ? selectedEphemeralVmRecipeId : null

      if (activeEphemeralVmRecipeId && selectedWorkspaceTarget.status === 'ready') {
        const vmRecipeTrustSettlement = await settleComposerSubmit(
          ensureHooksConfirmed(
            useAppStore.getState(),
            repoId,
            'vmRecipe',
            selectedRepoExecutionHostId ?? undefined,
            undefined,
            isSubmissionCancelled
          ),
          isSubmissionCancelled
        )
        if (vmRecipeTrustSettlement.status === 'cancelled') {
          return
        }
        const vmRecipeTrustDecision = vmRecipeTrustSettlement.value
        if (vmRecipeTrustDecision === 'skip') {
          return
        }
        const selectedRecipe = ephemeralVmRecipes.find(
          (recipe) => recipe.id === activeEphemeralVmRecipeId
        )
        ephemeralVmRecipe = {
          sourceRepoId: repoId,
          recipeId: activeEphemeralVmRecipeId,
          projectId: selectedWorkspaceTarget.target.projectId,
          ...(selectedRecipe?.checkoutMode ? { checkoutMode: selectedRecipe.checkoutMode } : {})
        }
      }

      const promptDelivery = quickDraftPrompt ? 'draft' : 'auto-submit'
      // Why: the verdict is persisted on the request as data and re-entered once the worktree exists.
      const agentLaunchRoute = agent
        ? planAgentSessionLaunch(useAppStore.getState(), {
            agent,
            workspace: {
              kind: selectedRepoIsGit ? 'git-worktree' : 'folder',
              repoId,
              executionHostId: ephemeralVmRecipe
                ? 'runtime:pending-ephemeral-vm'
                : (workspaceRunContext?.hostId ?? selectedRepoExecutionHostId ?? undefined)
            },
            prompt: quickDraftPrompt ?? quickPrompt,
            promptDelivery,
            initialSessionOptions: startupPlan?.sessionOptions
          }).route
        : 'terminal-tui'
      const structuredLaunch = agentLaunchRoute === 'structured-native-chat'

      const request = buildQuickCreationRequest({
        repoId,
        ephemeralVmRecipe,
        indeterminateProgress:
          Boolean(activeEphemeralVmRecipeId) ||
          getActiveRuntimeTarget(selectedRepoSettings).kind !== 'local',
        taskSourceContext,
        linkedWorkItem: submitLinkedWorkItem,
        workspaceRunContext,
        workspaceName,
        nameWasGenerated,
        displayName: createDisplayName,
        displayNameKind: createDisplayName ? (nameIsAutoManaged ? 'generated' : 'user') : undefined,
        selectedRepoIsGit,
        baseBranch: submitBaseBranch,
        compareBaseRef: submitCompareBaseRef,
        setupDecision: effectiveSetupDecision,
        sparseDirectories: selectedRepoIsGit && sparseEnabled ? normalizedSparseDirectories : null,
        sparsePresetId: effectivePresetId,
        telemetrySource,
        linkedIssue: submitLinkedIssueNumber,
        linkedPR: submitLinkedPR,
        pushTarget: submitPushTarget,
        agent,
        agentLaunchRoute,
        linkedLinearIssue,
        linkedLinearIssueWorkspaceId,
        linkedLinearIssueOrganizationUrlKey,
        branchNameOverride: effectiveBranchNameOverride,
        parentWorktreeId,
        workspaceStatus: resolvedInitialWorkspaceStatus,
        linkedGitLabMR,
        linkedGitLabIssue,
        includeGitLabLinks: smartGitHubResolution.kind === 'none',
        startup: structuredLaunch ? undefined : backendStartup,
        issueCommand,
        pendingFirstAgentMessageRename,
        note: trimmedNote,
        startupPlan,
        quickPrompt,
        launchDraftPrompt: quickDraftPrompt,
        promptDelivery,
        quickTelemetry,
        suppressTerminalFocusOnCompletion: createMultiple
      })

      if (isSubmissionCancelled()) {
        return
      }

      if (persistDraft) {
        clearNewWorkspaceDraft()
      }

      runBackgroundWorktreeCreation(request)

      if (createMultiple) {
        resetForNextCreate()
      } else {
        onCreated?.()
      }
    },
    [
      clearNewWorkspaceDraft,
      createMultiple,
      effectivePresetId,
      ephemeralVmRecipes,
      ephemeralVmsEnabled,
      isSubmissionCancelled,
      linkedGitLabIssue,
      linkedGitLabMR,
      normalizedSparseDirectories,
      onCreated,
      parentWorktreeId,
      persistDraft,
      persistSetupAgentStartupPolicy,
      prepareQuickSubmit,
      resetForNextCreate,
      resolvedInitialWorkspaceStatus,
      selectedEphemeralVmRecipeId,
      selectedRepoAgentLaunchPlatform,
      selectedRepoExecutionHostId,
      selectedRepoIsGit,
      selectedRepoIsRemote,
      selectedRepoSettings,
      selectedRepoStartupShell,
      selectedWorkspaceTarget,
      settings,
      sparseEnabled,
      taskSourceContext,
      telemetrySource
    ]
  )

  return {
    executeQuickCreation
  }
}
