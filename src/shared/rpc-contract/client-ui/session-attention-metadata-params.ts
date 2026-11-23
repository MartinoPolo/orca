import { z } from 'zod'
import { SESSION_ATTENTION_EPISODE_KINDS } from '../../session-attention'
import { THREAD_READ_FILTER_WIRE_VALUES } from '../../agent-status/presentation/agents-view-thread-filters'

export const SessionAttentionMetadataByIdentity = z.record(
  z.string(),
  z
    .object({
      priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      savedColor: z.enum(['blue', 'violet', 'teal', 'rose']).optional(),
      savedAt: z.number().finite().optional(),
      attentionEpisodeStartedAt: z.number().finite().optional(),
      attentionEpisodeKind: z.enum(SESSION_ATTENTION_EPISODE_KINDS).optional()
    })
    .strict()
)

/** Activity's attention read filter (still accepting legacy `unread`) and per-session attention metadata. */
export const SessionAttentionUiUpdateFields = {
  agentsReadFilter: z.enum(THREAD_READ_FILTER_WIRE_VALUES).optional(),
  sessionAttentionMetadataByIdentity: SessionAttentionMetadataByIdentity.optional()
}
