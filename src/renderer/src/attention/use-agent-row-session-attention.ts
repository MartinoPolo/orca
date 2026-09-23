import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'
import type { AgentDotState } from '@/components/AgentStateDot'
import {
  getRepoExecutionHostId,
  getSettingsFocusedExecutionHostId
} from '../../../shared/execution-host'
import { sessionAttentionTone } from '@/components/activity/session-attention-presentation'
import { isMigrationUnsupportedAgentEntry } from '@/lib/migration-unsupported-agent-entry'
import {
  findProjectedSessionTab,
  resolveSessionAttentionIdentity,
  resolveSessionAttentionWorkspaceFallback
} from './session-attention-identity'

export function useAgentRowSessionAttention(
  agent: DashboardAgentRow,
  status: AgentDotState,
  unread: boolean
) {
  const workspaceId = agent.entry.worktreeId ?? agent.tab.worktreeId
  const identityKeys = useAppStore(
    useShallow((state) => {
      const projectedTab = findProjectedSessionTab(
        state.unifiedTabsByWorktree,
        workspaceId,
        agent.tab.id
      )
      const retained = state.retainedAgentsByPaneKey[agent.paneKey]
      const identity = resolveSessionAttentionIdentity({
        workspaceId,
        agentType: agent.agentType,
        entry: agent.entry,
        terminalTab: retained?.tab ?? agent.tab,
        projectedTab,
        capturedExecutionHostId: retained?.executionHostId,
        resolveFallbackExecutionHostId: () => {
          const defaultHostId = getSettingsFocusedExecutionHostId(state.settings)
          const worktree = state.getKnownWorktreeById(workspaceId)
          const repo = worktree
            ? state.repos.find(
                (candidate) =>
                  candidate.id === worktree.repoId &&
                  (!worktree.hostId || getRepoExecutionHostId(candidate) === worktree.hostId)
              )
            : undefined
          return resolveSessionAttentionWorkspaceFallback({ worktree, repo, defaultHostId })
        }
      })
      return {
        sessionIdentity: identity?.sessionIdentity ?? null,
        identityAlias: identity?.identityAliases[0] ?? null
      }
    })
  )
  const metadata = useAppStore((state) => {
    const { sessionIdentity, identityAlias } = identityKeys
    return (
      (sessionIdentity ? state.sessionAttentionMetadataByIdentity[sessionIdentity] : undefined) ??
      (identityAlias ? state.sessionAttentionMetadataByIdentity[identityAlias] : undefined)
    )
  })
  return {
    sessionIdentity: identityKeys.sessionIdentity,
    priority: metadata?.priority ?? 3,
    savedColor: metadata?.savedColor,
    tone: isMigrationUnsupportedAgentEntry(agent.entry)
      ? null
      : sessionAttentionTone({ status, unread })
  }
}
