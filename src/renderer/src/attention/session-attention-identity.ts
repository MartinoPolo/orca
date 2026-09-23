import { getRemoteRuntimePtyEnvironmentId } from '@/runtime/runtime-terminal-stream'
import type { AgentStatusEntry, AgentType } from '../../../shared/agent-status-types'
import {
  LOCAL_EXECUTION_HOST_ID,
  getWorktreeExecutionHostId,
  toRuntimeExecutionHostId,
  toSshExecutionHostId,
  type ExecutionHostId
} from '../../../shared/execution-host'
import {
  buildSessionAttentionIdentity,
  type SessionAttentionMetadata
} from '../../../shared/session-attention'
import { parseAppSshPtyId } from '../../../shared/ssh-pty-id'
import { parseStructuredAgentSessionTabId } from '../../../shared/structured-agent-session-projection'
import type { Tab } from '../../../shared/tab-types'
import type { TerminalTab } from '../../../shared/terminal-tab-types'
import type { Repo } from '../../../shared/repo-types'
import type { Worktree } from '../../../shared/worktree/types'

export type ResolvedSessionAttentionIdentity = {
  sessionIdentity: string | null
  identityAliases: readonly string[]
  executionHostId: ExecutionHostId
  structuredSessionId: string | undefined
}

function resolveStructuredSessionId(
  projectedTab: Tab | undefined,
  terminalTabId: string
): string | undefined {
  if (projectedTab?.structuredSessionId?.trim()) {
    return projectedTab.structuredSessionId.trim()
  }
  if (projectedTab?.contentType === 'agent-session' && projectedTab.entityId.trim()) {
    return projectedTab.entityId.trim()
  }
  return (
    parseStructuredAgentSessionTabId(projectedTab?.id ?? '') ??
    parseStructuredAgentSessionTabId(terminalTabId) ??
    undefined
  )
}

function resolveExecutionHostId(args: {
  projectedTab?: Tab
  terminalTab: Pick<TerminalTab, 'ptyId'>
  entry: Pick<AgentStatusEntry, 'connectionId' | 'terminalHandle'>
  capturedExecutionHostId?: ExecutionHostId
  resolveFallbackExecutionHostId?: () => ExecutionHostId
}): ExecutionHostId {
  if (args.projectedTab?.executionHostId) {
    return args.projectedTab.executionHostId
  }
  if (args.capturedExecutionHostId) {
    return args.capturedExecutionHostId
  }
  const runtimeEnvironmentId =
    getRemoteRuntimePtyEnvironmentId(args.terminalTab.ptyId ?? '') ??
    getRemoteRuntimePtyEnvironmentId(args.entry.terminalHandle ?? '')
  if (runtimeEnvironmentId) {
    return toRuntimeExecutionHostId(runtimeEnvironmentId)
  }
  if (args.entry.connectionId !== undefined) {
    return args.entry.connectionId
      ? toSshExecutionHostId(args.entry.connectionId)
      : LOCAL_EXECUTION_HOST_ID
  }
  const sshConnectionId = parseAppSshPtyId(args.terminalTab.ptyId ?? '')?.connectionId
  if (sshConnectionId) {
    return toSshExecutionHostId(sshConnectionId)
  }
  return args.resolveFallbackExecutionHostId?.() ?? LOCAL_EXECUTION_HOST_ID
}

export function resolveSessionAttentionWorkspaceFallback(args: {
  worktree?: Pick<Worktree, 'hostId'>
  repo?: Pick<Repo, 'connectionId' | 'executionHostId'>
  defaultHostId?: ExecutionHostId
}): ExecutionHostId {
  return args.worktree
    ? getWorktreeExecutionHostId(args.worktree, args.repo, args.defaultHostId)
    : (args.defaultHostId ?? LOCAL_EXECUTION_HOST_ID)
}

export function hasSessionAttentionIdentityCandidate(args: {
  entry: Pick<AgentStatusEntry, 'providerSession'>
  projectedTab?: Tab
  terminalTabId: string
}): boolean {
  return Boolean(
    args.entry.providerSession || resolveStructuredSessionId(args.projectedTab, args.terminalTabId)
  )
}

export function resolveSessionAttentionIdentity(args: {
  workspaceId: string
  agentType: AgentType
  entry: Pick<AgentStatusEntry, 'connectionId' | 'providerSession' | 'terminalHandle'>
  terminalTab: Pick<TerminalTab, 'id' | 'ptyId'>
  projectedTab?: Tab
  capturedExecutionHostId?: ExecutionHostId
  resolveFallbackExecutionHostId?: () => ExecutionHostId
}): ResolvedSessionAttentionIdentity | null {
  const structuredSessionId = resolveStructuredSessionId(args.projectedTab, args.terminalTab.id)
  if (!args.entry.providerSession && !structuredSessionId) {
    return null
  }
  const executionHostId = resolveExecutionHostId(args)
  const base = {
    executionHostId,
    workspaceId: args.workspaceId,
    agentType: args.agentType
  }
  const providerIdentity = args.entry.providerSession
    ? buildSessionAttentionIdentity({ ...base, providerSession: args.entry.providerSession })
    : null
  const structuredIdentity = structuredSessionId
    ? buildSessionAttentionIdentity({ ...base, structuredSessionId })
    : null
  return {
    sessionIdentity: providerIdentity ?? structuredIdentity,
    identityAliases:
      providerIdentity && structuredIdentity && providerIdentity !== structuredIdentity
        ? [structuredIdentity]
        : [],
    executionHostId,
    structuredSessionId
  }
}

export function findSessionAttentionMetadata(
  metadataByIdentity: Record<string, SessionAttentionMetadata>,
  identity: ResolvedSessionAttentionIdentity
): SessionAttentionMetadata | undefined {
  if (identity.sessionIdentity && metadataByIdentity[identity.sessionIdentity]) {
    return metadataByIdentity[identity.sessionIdentity]
  }
  for (const alias of identity.identityAliases) {
    const metadata = metadataByIdentity[alias]
    if (metadata) {
      return metadata
    }
  }
  return undefined
}

export function findProjectedSessionTab(
  tabsByWorktree: Record<string, Tab[]> | undefined,
  workspaceId: string,
  terminalTabId: string
): Tab | undefined {
  const matches = (tabsByWorktree?.[workspaceId] ?? []).filter(
    (tab) =>
      (tab.contentType === 'terminal' && tab.entityId === terminalTabId) ||
      (tab.contentType === 'agent-session' && tab.id === terminalTabId)
  )
  return matches.length === 1 ? matches[0] : undefined
}
