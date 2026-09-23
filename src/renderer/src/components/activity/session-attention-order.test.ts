import { describe, expect, it } from 'vitest'
import type { AgentPaneThread } from './activity-thread-types'
import { makeTabWithIds, makeWorktree } from './ActivityPrototypePage-test-fixtures'
import {
  compareAttentionThreads,
  isAttentionQueueEligible,
  resolveAttentionStartedAt
} from './session-attention-presentation'

const worktree = makeWorktree()

function thread(
  paneKey: string,
  overrides: Partial<AgentPaneThread> & {
    priority?: AgentPaneThread['priority']
    attentionStartedAt?: number | null
  } = {}
): AgentPaneThread {
  return {
    paneKey,
    paneTitle: paneKey,
    worktree,
    repo: null,
    tab: makeTabWithIds(paneKey.split(':')[0], worktree.id),
    agentType: 'claude',
    currentAgentState: null,
    currentAgentEntry: null,
    responsePreview: '',
    latestTimestamp: 1,
    latestEvent: null,
    events: [],
    unread: false,
    priority: 3,
    savedMarker: null,
    attentionStartedAt: null,
    attentionEligible: false,
    sessionIdentity: null,
    ...overrides
  }
}

describe('attention queue ordering', () => {
  it('sorts priority P5 through P1 before unread, age, then identity', () => {
    const rows = [
      thread('z', { priority: 1, unread: true, attentionStartedAt: 1 }),
      thread('a', { priority: 5, unread: false, attentionStartedAt: 5 }),
      thread('c', { priority: 4, unread: false, attentionStartedAt: 1 }),
      thread('b', { priority: 4, unread: true, attentionStartedAt: 10 }),
      thread('e', { priority: 4, unread: true, attentionStartedAt: 3 }),
      thread('d', { priority: 4, unread: true, attentionStartedAt: 3 })
    ]

    expect(rows.sort(compareAttentionThreads).map((row) => row.paneKey)).toEqual([
      'a',
      'd',
      'e',
      'b',
      'c',
      'z'
    ])
  })

  it('keeps unread ahead of an older read row at equal priority', () => {
    const olderRead = thread('read', { priority: 3, unread: false, attentionStartedAt: 1 })
    const youngerUnread = thread('unread', { priority: 3, unread: true, attentionStartedAt: 10 })
    expect([olderRead, youngerUnread].sort(compareAttentionThreads)[0]).toBe(youngerUnread)
  })

  it('keeps a read higher-priority row ahead of an unread lower-priority row', () => {
    const higherRead = thread('high', { priority: 5, unread: false, attentionStartedAt: 10 })
    const lowerUnread = thread('low', { priority: 4, unread: true, attentionStartedAt: 1 })
    expect([lowerUnread, higherRead].sort(compareAttentionThreads)[0]).toBe(higherRead)
  })
})

describe('attention episode age', () => {
  it('uses the earliest saved marker or status chronology', () => {
    expect(
      resolveAttentionStartedAt({
        status: 'waiting',
        unread: true,
        statusStartedAt: 100,
        savedAt: 50
      })
    ).toBe(50)
  })

  it('starts a new episode after resolution and a later attention transition', () => {
    expect(
      resolveAttentionStartedAt({
        status: 'done',
        unread: false,
        statusStartedAt: 200,
        savedAt: undefined
      })
    ).toBeNull()
    expect(
      resolveAttentionStartedAt({
        status: 'blocked',
        unread: false,
        statusStartedAt: 300,
        savedAt: undefined
      })
    ).toBe(300)
  })
})

describe('attention queue eligibility', () => {
  it('retains read unresolved and saved sessions but drops read completion', () => {
    expect(isAttentionQueueEligible({ status: 'waiting', unread: false, saved: false })).toBe(true)
    expect(isAttentionQueueEligible({ status: 'blocked', unread: false, saved: false })).toBe(true)
    expect(isAttentionQueueEligible({ status: 'done', unread: false, saved: false })).toBe(false)
    expect(isAttentionQueueEligible({ status: 'done', unread: false, saved: true })).toBe(true)
    expect(isAttentionQueueEligible({ status: 'done', unread: true, saved: false })).toBe(true)
    expect(isAttentionQueueEligible({ status: 'unverifiable', unread: false, saved: false })).toBe(
      false
    )
  })
})
