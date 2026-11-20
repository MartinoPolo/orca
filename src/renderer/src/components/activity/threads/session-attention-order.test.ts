import { describe, expect, it } from 'vitest'
import {
  isAttentionQueueEligible,
  resolveAttentionStartedAt
} from './session-attention-presentation'

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
