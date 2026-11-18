import { z } from 'zod'
import { SESSION_ATTENTION_EPISODE_KINDS } from '../../session-attention'

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
