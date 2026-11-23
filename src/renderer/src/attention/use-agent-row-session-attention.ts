import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import type { DashboardAgentRow } from '@/components/dashboard/rows/dashboard-agent-row'
import type { AgentDotState } from '@/components/agent/status/AgentStateDot'
import {
  getRepoExecutionHostId,
  getSettingsFocusedExecutionHostId
} from '../../../shared/execution-host/execution-host'
import { sessionAttentionTone } from '@/components/activity/threads/session-attention-presentation'
import { isMigrationUnsupportedAgentEntry } from '../../../shared/agent-status/presentation/migration-unsupported-agent-entry'
import {
  findProjectedSessionTab,
  resolveSessionAttentionIdentity,
  resolveSessionAttentionWorkspaceFallback
} from './session-attention-identity'
import { DEFAULT_SESSION_PRIORITY } from '../../../shared/session-effective-priority'

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
      const identity = resolveSessionAttentionIdentity({
        workspaceId,
        agentType: agent.agentType,
        entry: agent.entry,
        terminalTab: agent.tab,
        projectedTab,
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
  // Subagent rows have no session of their own, so they keep their plain rendering.
  const isSession = agent.rowSource !== 'subagent'
  return {
    isSession,
    sessionIdentity: identityKeys.sessionIdentity,
    priority: metadata?.priority ?? DEFAULT_SESSION_PRIORITY,
    savedColor: metadata?.savedColor,
    unread: isSession && unread,
    tone:
      !isSession || isMigrationUnsupportedAgentEntry(agent.entry)
        ? null
        : sessionAttentionTone({ status, unread })
  }
}

export type AgentRowSessionAttention = ReturnType<typeof useAgentRowSessionAttention>
