import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTranscriptWatchScheduler,
  type TranscriptWatchScheduler
} from './transcript-watch-scheduler'

let scheduler: TranscriptWatchScheduler | undefined

afterEach(() => {
  scheduler?.dispose()
  scheduler = undefined
  vi.useRealTimers()
})

describe('transcript watch scheduler', () => {
  it('drains at the max wait despite sustained events', async () => {
    vi.useFakeTimers()
    const drain = vi.fn()
    scheduler = createTranscriptWatchScheduler({
      debounceMs: 40,
      drain,
      reconcile: async () => {}
    })

    scheduler.scheduleEventDrain()
    for (let elapsedMs = 20; elapsedMs <= 240; elapsedMs += 20) {
      await vi.advanceTimersByTimeAsync(20)
      scheduler.scheduleEventDrain()
      expect(drain).not.toHaveBeenCalled()
    }

    await vi.advanceTimersByTimeAsync(9)
    expect(drain).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(drain).toHaveBeenCalledOnce()
  })
})
