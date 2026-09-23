import { describe, expect, it } from 'vitest'
import {
  buildSessionAttentionIdentity,
  normalizeSessionAttentionMetadataByIdentity
} from './session-attention'

describe('buildSessionAttentionIdentity', () => {
  it('scopes provider sessions by host, workspace, provider, and session', () => {
    const base = {
      executionHostId: 'ssh:builder',
      workspaceId: 'folder:C:/repo',
      agentType: 'codex',
      providerSession: { key: 'session_id' as const, id: 'session-1' }
    }

    expect(buildSessionAttentionIdentity(base)).not.toBe(
      buildSessionAttentionIdentity({ ...base, executionHostId: 'local' })
    )
    expect(buildSessionAttentionIdentity(base)).not.toBe(
      buildSessionAttentionIdentity({ ...base, workspaceId: 'folder:C:/other' })
    )
    expect(buildSessionAttentionIdentity(base)).not.toBe(
      buildSessionAttentionIdentity({
        ...base,
        providerSession: { key: 'session_id', id: 'session-2' }
      })
    )
  })

  it('uses Pi transcript identity and supports structured session record identities', () => {
    const pi = {
      executionHostId: 'local',
      workspaceId: 'wt-1',
      agentType: 'pi',
      providerSession: {
        key: 'session_id' as const,
        id: 'session-1',
        transcriptPath: 'C:/one.jsonl'
      }
    }
    expect(buildSessionAttentionIdentity(pi)).not.toBe(
      buildSessionAttentionIdentity({
        ...pi,
        providerSession: { ...pi.providerSession, transcriptPath: 'C:/two.jsonl' }
      })
    )
    expect(buildSessionAttentionIdentity({ ...pi, structuredSessionId: 'pane-a' })).toBe(
      buildSessionAttentionIdentity({ ...pi, structuredSessionId: 'replacement-pane' })
    )
    expect(
      buildSessionAttentionIdentity({
        executionHostId: 'runtime:host',
        workspaceId: 'folder-1',
        agentType: 'codex',
        structuredSessionId: 'structured-1'
      })
    ).toBeTruthy()
  })

  it('refuses a pane-only durable identity', () => {
    expect(
      buildSessionAttentionIdentity({
        executionHostId: 'local',
        workspaceId: 'wt-1',
        agentType: 'claude'
      })
    ).toBeNull()
  })
})

describe('normalizeSessionAttentionMetadataByIdentity', () => {
  it('validates optional persisted metadata field by field', () => {
    expect(
      normalizeSessionAttentionMetadataByIdentity({
        good: {
          priority: 5,
          savedColor: 'violet',
          savedAt: 123,
          attentionEpisodeStartedAt: 100
        },
        defaultPriority: { priority: 3 },
        badPriority: { priority: 9, savedColor: 'blue', savedAt: 10 },
        badColor: { priority: 2, savedColor: 'orange', savedAt: 20 },
        missingSavedAt: { priority: 4, savedColor: 'rose' },
        badEpisode: { priority: 1, attentionEpisodeStartedAt: -1 },
        badRecord: 'nope'
      })
    ).toEqual({
      good: {
        priority: 5,
        savedColor: 'violet',
        savedAt: 123,
        attentionEpisodeStartedAt: 100
      },
      defaultPriority: { priority: 3 },
      badPriority: { priority: 3, savedColor: 'blue', savedAt: 10 },
      badColor: { priority: 2 },
      missingSavedAt: { priority: 4 },
      badEpisode: { priority: 1 }
    })
  })
})
