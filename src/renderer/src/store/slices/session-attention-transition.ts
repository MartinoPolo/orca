import {
  findProjectedSessionTab,
  hasSessionAttentionIdentityCandidate,
  resolveSessionAttentionIdentity,
  resolveSessionAttentionWorkspaceFallback
} from '@/attention/session-attention-identity'
import type { AppState } from '../types'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import {
  getRepoExecutionHostId,
  getSettingsFocusedExecutionHostId
} from '../../../../shared/execution-host'
import type {
  SessionAttentionEpisodeKind,
  SessionAttentionMetadata
} from '../../../../shared/session-attention'
import type { AgentStatusLiveEntryBuild } from './agent-status-live-entry-builder'
import { getTabIdFromPaneKey } from './agent-status-pane-key-tab-binding'

function attentionEpisodeKind(
  entry: AgentStatusEntry,
  acknowledgedAt: number
): SessionAttentionEpisodeKind | null {
  if (entry.state === 'waiting' || entry.state === 'blocked') {
    return 'unresolved-input'
  }
  return entry.state === 'done' && acknowledgedAt < entry.stateStartedAt ? 'unread-outcome' : null
}

function terminalIdentityInput(state: AppState, entry: AgentStatusEntry) {
  const workspaceId = entry.worktreeId
  const tabId = entry.tabId ?? getTabIdFromPaneKey(entry.paneKey) ?? ''
  const liveTab = workspaceId
    ? state.tabsByWorktree[workspaceId]?.find((candidate) => candidate.id === tabId)
    : undefined
  const retained = state.retainedAgentsByPaneKey[entry.paneKey]
  return {
    terminalTab: liveTab ?? retained?.tab ?? { id: tabId, ptyId: null },
    capturedExecutionHostId: retained?.executionHostId
  }
}

export function resolveEntryIdentity(state: AppState, entry: AgentStatusEntry) {
  const workspaceId = entry.worktreeId
  const tabId = entry.tabId ?? getTabIdFromPaneKey(entry.paneKey) ?? ''
  if (!workspaceId || !tabId) {
    return null
  }
  const projectedTab = findProjectedSessionTab(state.unifiedTabsByWorktree, workspaceId, tabId)
  if (
    !hasSessionAttentionIdentityCandidate({
      entry,
      projectedTab,
      terminalTabId: tabId
    })
  ) {
    return null
  }
  const { terminalTab, capturedExecutionHostId } = terminalIdentityInput(state, entry)
  return resolveSessionAttentionIdentity({
    workspaceId,
    agentType: entry.agentType ?? 'unknown',
    entry,
    terminalTab,
    projectedTab,
    capturedExecutionHostId,
    resolveFallbackExecutionHostId: () => {
      const worktree = state.getKnownWorktreeById(workspaceId)
      const repo = worktree
        ? state.repos.find(
            (candidate) =>
              candidate.id === worktree.repoId &&
              (!worktree.hostId || getRepoExecutionHostId(candidate) === worktree.hostId)
          )
        : undefined
      return resolveSessionAttentionWorkspaceFallback({
        worktree,
        repo,
        defaultHostId: getSettingsFocusedExecutionHostId(state.settings)
      })
    }
  })
}

function hasMeaningfulMetadata(metadata: SessionAttentionMetadata): boolean {
  return (
    metadata.priority !== 3 ||
    metadata.savedColor !== undefined ||
    metadata.attentionEpisodeStartedAt !== undefined
  )
}

function migrateIdentityMetadata(
  current: Record<string, SessionAttentionMetadata>,
  sessionIdentity: string,
  aliases: readonly string[]
): { metadata: SessionAttentionMetadata; next: Record<string, SessionAttentionMetadata> } {
  const alias = aliases.find((candidate) => current[candidate] !== undefined)
  const canonical = current[sessionIdentity]
  const metadata = canonical ?? (alias ? current[alias] : undefined) ?? { priority: 3 }
  let next = current
  if (alias || !canonical) {
    next = { ...current, [sessionIdentity]: metadata }
    for (const identityAlias of aliases) {
      delete next[identityAlias]
    }
  }
  return { metadata, next }
}

export function updateSessionAttentionForAcceptedStatus(
  state: AppState,
  build: AgentStatusLiveEntryBuild
): Record<string, SessionAttentionMetadata> {
  const identity = resolveEntryIdentity(state, build.entry)
  if (!identity?.sessionIdentity) {
    return state.sessionAttentionMetadataByIdentity
  }
  const migrated = migrateIdentityMetadata(
    state.sessionAttentionMetadataByIdentity,
    identity.sessionIdentity,
    identity.identityAliases
  )
  const acknowledgedAt = state.acknowledgedAgentsByPaneKey[build.entry.paneKey] ?? 0
  const episodeKind = attentionEpisodeKind(build.entry, acknowledgedAt)
  const previousIdentity = build.existing ? resolveEntryIdentity(state, build.existing) : null
  const previousEpisodeKind = build.existing
    ? attentionEpisodeKind(build.existing, acknowledgedAt)
    : null
  const continuesEpisode =
    episodeKind !== null &&
    (migrated.metadata.attentionEpisodeKind === episodeKind ||
      (migrated.metadata.attentionEpisodeKind === undefined &&
        episodeKind === previousEpisodeKind &&
        previousIdentity?.sessionIdentity === identity.sessionIdentity))
  const attentionEpisodeStartedAt = episodeKind
    ? continuesEpisode && migrated.metadata.attentionEpisodeStartedAt !== undefined
      ? migrated.metadata.attentionEpisodeStartedAt
      : build.entry.stateStartedAt
    : undefined
  const nextMetadata: SessionAttentionMetadata = {
    ...migrated.metadata,
    ...(attentionEpisodeStartedAt !== undefined
      ? { attentionEpisodeStartedAt, attentionEpisodeKind: episodeKind ?? undefined }
      : {})
  }
  if (attentionEpisodeStartedAt === undefined) {
    delete nextMetadata.attentionEpisodeStartedAt
    delete nextMetadata.attentionEpisodeKind
  }
  const next = migrated.next
  if (!hasMeaningfulMetadata(nextMetadata)) {
    if (next[identity.sessionIdentity] === undefined) {
      return next
    }
    const cleaned = { ...next }
    delete cleaned[identity.sessionIdentity]
    return cleaned
  }
  if (
    next[identity.sessionIdentity]?.priority === nextMetadata.priority &&
    next[identity.sessionIdentity]?.savedColor === nextMetadata.savedColor &&
    next[identity.sessionIdentity]?.savedAt === nextMetadata.savedAt &&
    next[identity.sessionIdentity]?.attentionEpisodeStartedAt ===
      nextMetadata.attentionEpisodeStartedAt &&
    next[identity.sessionIdentity]?.attentionEpisodeKind === nextMetadata.attentionEpisodeKind
  ) {
    return next
  }
  return { ...next, [identity.sessionIdentity]: nextMetadata }
}

export function updateSessionAttentionForReadState(
  state: AppState,
  paneKeys: readonly string[],
  unread: boolean
): Record<string, SessionAttentionMetadata> {
  let next = state.sessionAttentionMetadataByIdentity
  for (const paneKey of paneKeys) {
    const entry =
      state.agentStatusByPaneKey?.[paneKey] ?? state.retainedAgentsByPaneKey?.[paneKey]?.entry
    if (!entry || entry.state === 'waiting' || entry.state === 'blocked') {
      continue
    }
    const identity = resolveEntryIdentity(state, entry)
    if (!identity?.sessionIdentity) {
      continue
    }
    const migrated = migrateIdentityMetadata(
      next,
      identity.sessionIdentity,
      identity.identityAliases
    )
    const metadata: SessionAttentionMetadata = {
      ...migrated.metadata,
      ...(unread
        ? {
            attentionEpisodeStartedAt: entry.stateStartedAt,
            attentionEpisodeKind: 'unread-outcome' as const
          }
        : {})
    }
    if (!unread) {
      delete metadata.attentionEpisodeStartedAt
      delete metadata.attentionEpisodeKind
    }
    next = migrated.next
    if (hasMeaningfulMetadata(metadata)) {
      next = { ...next, [identity.sessionIdentity]: metadata }
    } else if (next[identity.sessionIdentity]) {
      next = { ...next }
      delete next[identity.sessionIdentity]
    }
  }
  return next
}
