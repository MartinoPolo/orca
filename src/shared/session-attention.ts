import type { AgentProviderSessionMetadata } from './agent-session-resume'

export const SESSION_PRIORITIES = [1, 2, 3, 4, 5] as const
export type SessionPriority = (typeof SESSION_PRIORITIES)[number]

export const SESSION_SAVED_COLORS = ['blue', 'violet', 'teal', 'rose'] as const
export type SessionSavedColor = (typeof SESSION_SAVED_COLORS)[number]

export const SESSION_ATTENTION_EPISODE_KINDS = ['unresolved-input', 'unread-outcome'] as const
export type SessionAttentionEpisodeKind = (typeof SESSION_ATTENTION_EPISODE_KINDS)[number]

export type SessionAttentionMetadata = {
  priority: SessionPriority
  savedColor?: SessionSavedColor
  savedAt?: number
  /** Start and category of the current attention episode, persisted across replay and restart. */
  attentionEpisodeStartedAt?: number
  attentionEpisodeKind?: SessionAttentionEpisodeKind
}

export type SessionAttentionIdentityInput = {
  executionHostId: string
  workspaceId: string
  agentType: string
  providerSession?: AgentProviderSessionMetadata
  structuredSessionId?: string
}

const PRIORITY_SET: ReadonlySet<number> = new Set(SESSION_PRIORITIES)
const SAVED_COLOR_SET: ReadonlySet<string> = new Set(SESSION_SAVED_COLORS)
const ATTENTION_EPISODE_KIND_SET: ReadonlySet<string> = new Set(SESSION_ATTENTION_EPISODE_KINDS)

export function buildSessionAttentionIdentity(input: SessionAttentionIdentityInput): string | null {
  const structuredSessionId = input.structuredSessionId?.trim()
  const providerSession = input.providerSession
  if (!structuredSessionId && !providerSession) {
    return null
  }
  const sessionIdentity = providerSession
    ? [
        'provider',
        providerSession.key,
        providerSession.id,
        input.agentType === 'pi' || input.agentType === 'prime-agent'
          ? (providerSession.transcriptPath ?? '')
          : ''
      ]
    : ['structured', structuredSessionId]
  return JSON.stringify([
    'session-attention-v1',
    input.executionHostId,
    input.workspaceId,
    input.agentType,
    ...sessionIdentity
  ])
}

function isSessionPriority(value: unknown): value is SessionPriority {
  return typeof value === 'number' && PRIORITY_SET.has(value)
}

function normalizePriority(value: unknown): SessionPriority {
  return isSessionPriority(value) ? value : 3
}

function isSessionSavedColor(value: unknown): value is SessionSavedColor {
  return typeof value === 'string' && SAVED_COLOR_SET.has(value)
}

function normalizeSavedColor(value: unknown): SessionSavedColor | undefined {
  return isSessionSavedColor(value) ? value : undefined
}

function isSessionAttentionEpisodeKind(value: unknown): value is SessionAttentionEpisodeKind {
  return typeof value === 'string' && ATTENTION_EPISODE_KIND_SET.has(value)
}

export function normalizeSessionAttentionMetadataByIdentity(
  value: unknown
): Record<string, SessionAttentionMetadata> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  const normalized: Record<string, SessionAttentionMetadata> = {}
  for (const [identity, rawMetadata] of Object.entries(value)) {
    if (
      !identity ||
      !rawMetadata ||
      typeof rawMetadata !== 'object' ||
      Array.isArray(rawMetadata)
    ) {
      continue
    }
    const priority = normalizePriority('priority' in rawMetadata ? rawMetadata.priority : undefined)
    const savedColor = normalizeSavedColor(
      'savedColor' in rawMetadata ? rawMetadata.savedColor : undefined
    )
    const rawSavedAt = 'savedAt' in rawMetadata ? rawMetadata.savedAt : undefined
    const savedAt =
      savedColor && typeof rawSavedAt === 'number' && Number.isFinite(rawSavedAt) && rawSavedAt > 0
        ? rawSavedAt
        : undefined
    const rawAttentionEpisodeStartedAt =
      'attentionEpisodeStartedAt' in rawMetadata ? rawMetadata.attentionEpisodeStartedAt : undefined
    const attentionEpisodeStartedAt =
      typeof rawAttentionEpisodeStartedAt === 'number' &&
      Number.isFinite(rawAttentionEpisodeStartedAt) &&
      rawAttentionEpisodeStartedAt > 0
        ? rawAttentionEpisodeStartedAt
        : undefined
    const rawAttentionEpisodeKind =
      'attentionEpisodeKind' in rawMetadata ? rawMetadata.attentionEpisodeKind : undefined
    const attentionEpisodeKind = isSessionAttentionEpisodeKind(rawAttentionEpisodeKind)
      ? rawAttentionEpisodeKind
      : undefined
    normalized[identity] = {
      priority,
      ...(savedColor && savedAt !== undefined ? { savedColor, savedAt } : {}),
      ...(attentionEpisodeStartedAt !== undefined
        ? { attentionEpisodeStartedAt, ...(attentionEpisodeKind ? { attentionEpisodeKind } : {}) }
        : {})
    }
  }
  return normalized
}
