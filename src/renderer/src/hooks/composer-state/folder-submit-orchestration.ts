import type { ComposerModel } from './composer-model'

type FolderSubmitOrchestrationInput = Pick<
  ComposerModel,
  | 'clearNewWorkspaceDraft'
  | 'createFolderWorkspace'
  | 'disabledTuiAgents'
  | 'folderCreateDisabled'
  | 'folderSourceRepos'
  | 'folderTargetConnectionId'
  | 'folderTargetIsRemote'
  | 'folderTargetRuntimeEnvironmentId'
  | 'isSubmissionCancelled'
  | 'lastAutoNameRef'
  | 'linkedWorkItem'
  | 'name'
  | 'note'
  | 'onCreated'
  | 'persistDraft'
  | 'resolvePendingSmartGitHubSubmit'
  | 'selectedProjectGroup'
  | 'setCreateError'
  | 'setCreating'
  | 'settings'
  | 'taskSourceContext'
  | 'telemetrySource'
> & {
  decisions: Pick<ComposerModel['decisions'], 'canResolveFolderSmartGitHubSubmit'>
}

import { useCallback } from 'react'
import { useAppStore } from '@/store'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { AgentLaunchProfile } from '../../../../shared/agent-launch-profiles'
import {
  buildAgentLaunchProfileEnv,
  isProfileAgent
} from '../../../../shared/agent-launch-profile-agents'
import {
  getValidatedComposerAgentProfile,
  resolveFolderComposerProfileHostScope
} from '@/lib/composer-agent-profile-target'
import { settleComposerSubmit } from '@/lib/composer-submit-cancellation'
import { isTuiAgentEnabled } from '../../../../shared/tui-agent-selection'
import {
  resolveFolderWorkspaceLaunchDraft,
  submitFolderWorkspaceCreate
} from '@/components/sidebar/folder-workspace-composer-submit'
import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '../../../../shared/tui-agent-launch-defaults'
import { resolveInitialNativeChatSessionOptions } from '@/components/native-chat/native-chat-launch-session-options'
import { isNativeChatTranscriptLocalReadable } from '@/lib/native-chat-transcript-readability'
import { translate } from '@/i18n/i18n'
import {
  formatWorkspaceCreateError,
  getWorkspaceCreateErrorToastMessage
} from '@/lib/workspace-create-error-format'
import { toast } from 'sonner'

export function useFolderSubmitOrchestration(input: FolderSubmitOrchestrationInput) {
  const {
    clearNewWorkspaceDraft,
    createFolderWorkspace,
    decisions,
    disabledTuiAgents,
    folderCreateDisabled,
    folderSourceRepos,
    folderTargetConnectionId,
    folderTargetIsRemote,
    folderTargetRuntimeEnvironmentId,
    isSubmissionCancelled,
    lastAutoNameRef,
    linkedWorkItem,
    name,
    note,
    onCreated,
    persistDraft,
    resolvePendingSmartGitHubSubmit,
    selectedProjectGroup,
    setCreateError,
    setCreating,
    settings,
    taskSourceContext,
    telemetrySource
  } = input
  const { canResolveFolderSmartGitHubSubmit } = decisions

  const submitFolderTarget = useCallback(
    async (requestedAgent: TuiAgent | null, agentProfile?: AgentLaunchProfile): Promise<void> => {
      if (!selectedProjectGroup?.parentPath || folderCreateDisabled) {
        return
      }
      setCreateError(null)
      setCreating(true)
      try {
        const liveStore = useAppStore.getState()
        const selectedProfile = getValidatedComposerAgentProfile(
          requestedAgent,
          agentProfile,
          liveStore.settings,
          resolveFolderComposerProfileHostScope(selectedProjectGroup, liveStore.sshConnectionStates)
        )
        const shouldResolveSmartGitHubSubmit = canResolveFolderSmartGitHubSubmit({
          hasFolderSourceRepos: folderSourceRepos.length > 0
        })
        const smartGitHubSettlement = await settleComposerSubmit(
          shouldResolveSmartGitHubSubmit
            ? resolvePendingSmartGitHubSubmit()
            : Promise.resolve({ kind: 'none' } as const),
          isSubmissionCancelled
        )
        if (smartGitHubSettlement.status === 'cancelled') {
          return
        }
        const smartGitHubResolution = smartGitHubSettlement.value
        const smartGitHubMetadata =
          smartGitHubResolution.kind === 'none' ? null : smartGitHubResolution
        const submitLinkedWorkItem = smartGitHubMetadata?.linkedWorkItem ?? linkedWorkItem
        const agent =
          requestedAgent && isTuiAgentEnabled(requestedAgent, disabledTuiAgents)
            ? requestedAgent
            : null
        const profileAgent = selectedProfile && agent && isProfileAgent(agent) ? agent : null
        if (selectedProfile && agent !== requestedAgent) {
          throw new Error(
            'The selected agent is no longer available. Select another agent before creating the workspace.'
          )
        }
        if (isSubmissionCancelled()) {
          return
        }
        const linkedWorkItemPromptTemplate = agent
          ? settings?.agentLinkedWorkItemPromptTemplates?.[agent]
          : undefined
        const folderLaunchDraftText =
          agent && submitLinkedWorkItem
            ? resolveFolderWorkspaceLaunchDraft(
                submitLinkedWorkItem,
                note,
                linkedWorkItemPromptTemplate
              )
            : null
        const folderWorkspaceCreated = await submitFolderWorkspaceCreate({
          projectGroup: selectedProjectGroup,
          name: smartGitHubMetadata?.workspaceName ?? name,
          lastAutoName: lastAutoNameRef.current,
          linkedWorkItem: submitLinkedWorkItem,
          linkedTaskSourceContext: taskSourceContext,
          note,
          quickAgent: agent,
          autoRenameBranchFromWork: settings?.autoRenameBranchFromWork,
          agentCmdOverrides:
            profileAgent && selectedProfile
              ? { ...settings?.agentCmdOverrides, [profileAgent]: selectedProfile.command }
              : settings?.agentCmdOverrides,
          linkedWorkItemPromptTemplate,
          agentArgs: agent
            ? resolveTuiAgentLaunchArgs(agent, settings?.agentDefaultArgs)
            : undefined,
          agentEnv: agent
            ? {
                ...resolveTuiAgentLaunchEnv(agent, settings?.agentDefaultEnv),
                ...(profileAgent && selectedProfile
                  ? buildAgentLaunchProfileEnv(profileAgent, selectedProfile)
                  : {})
              }
            : undefined,
          sessionOptions: agent
            ? resolveInitialNativeChatSessionOptions(
                {
                  experimentalNativeChat: settings?.experimentalNativeChat,
                  openAgentTabsInChatByDefault: settings?.openAgentTabsInChatByDefault,
                  nativeChatSessionOptions: settings?.nativeChatSessionOptions
                },
                {
                  agent,
                  ...(folderLaunchDraftText
                    ? {
                        promptDelivery: 'draft' as const,
                        launchDraftText: folderLaunchDraftText
                      }
                    : {}),
                  nativeChatTranscriptIsLocalReadable:
                    isNativeChatTranscriptLocalReadable(folderTargetConnectionId)
                }
              )
            : undefined,
          terminalWindowsShell: settings?.terminalWindowsShell,
          isRemote: folderTargetIsRemote,
          launchSource: telemetrySource === 'onboarding' ? 'onboarding' : 'new_workspace_composer',
          runtimeEnvironmentId: folderTargetRuntimeEnvironmentId,
          createFolderWorkspace: (input) =>
            createFolderWorkspace(input, {
              runtimeEnvironmentId: folderTargetRuntimeEnvironmentId
            }),
          onOpenChange: (open) => {
            if (!open) {
              if (persistDraft) {
                clearNewWorkspaceDraft()
              }
              onCreated?.()
            }
          }
        })
        if (!folderWorkspaceCreated) {
          setCreateError({
            title: translate(
              'auto.hooks.useComposerState.folderWorkspaceCreateFailedTitle',
              'Folder workspace creation failed'
            ),
            message: translate(
              'auto.hooks.useComposerState.folderWorkspaceCreateFailedMessage',
              'The folder workspace could not be created. Check the error details above, then try again.'
            )
          })
        }
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
      clearNewWorkspaceDraft,
      createFolderWorkspace,
      canResolveFolderSmartGitHubSubmit,
      disabledTuiAgents,
      folderCreateDisabled,
      folderTargetConnectionId,
      folderTargetIsRemote,
      folderTargetRuntimeEnvironmentId,
      folderSourceRepos.length,
      isSubmissionCancelled,
      linkedWorkItem,
      name,
      note,
      onCreated,
      persistDraft,
      resolvePendingSmartGitHubSubmit,
      selectedProjectGroup,
      settings,
      taskSourceContext,
      telemetrySource,
      lastAutoNameRef,
      setCreateError,
      setCreating
    ]
  )

  return {
    submitFolderTarget
  }
}
