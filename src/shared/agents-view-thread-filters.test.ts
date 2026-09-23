import { describe, expect, it } from 'vitest'
import { normalizeThreadReadFilter, THREAD_READ_FILTER_VALUES } from './agents-view-thread-filters'

describe('agents read filter migration', () => {
  it('migrates legacy unread-only profiles to Attention', () => {
    expect(normalizeThreadReadFilter('unread')).toBe('attention')
    expect(THREAD_READ_FILTER_VALUES).toEqual(['attention', 'all'])
  })
})
