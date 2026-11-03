// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST_REPLAY_REATTACH_RESET } from '../../../../../shared/terminal-mode-reset-profiles'

const recordBreadcrumb = vi.hoisted(() => vi.fn())
vi.mock('@/lib/crash-breadcrumb-recorder', () => ({
  recordRendererCrashBreadcrumb: recordBreadcrumb
}))

const { installMouseTrackingLossProbe } = await import('./mouse-tracking-loss-probe')

type Handler = (params: (number | number[])[]) => boolean

function createProbeHarness() {
  const handlers = new Map<string, Handler>()
  const terminal = {
    modes: { mouseTrackingMode: 'none' },
    buffer: { active: { type: 'alternate' } },
    parser: {
      registerCsiHandler: (id: { final: string }, handler: Handler) => {
        handlers.set(id.final, handler)
        return { dispose: () => handlers.delete(id.final) }
      }
    }
  }
  const wheelTarget = document.createElement('div')
  let replaying = false
  const probe = installMouseTrackingLossProbe({
    terminal,
    wheelTarget,
    isReplaying: () => replaying,
    identity: () => ({ paneId: 7, ptyId: null }),
    now: () => Date.now()
  })
  // Mirror xterm: custom handlers observe before the built-in handler applies the mode.
  const parse = (final: 'h' | 'l', mode: number, nextMode: string): void => {
    handlers.get(final)?.([mode])
    terminal.modes.mouseTrackingMode = nextMode
  }
  return {
    probe,
    parse,
    wheel: () => wheelTarget.dispatchEvent(new Event('wheel')),
    setReplaying: (value: boolean) => {
      replaying = value
    }
  }
}

describe('mouse tracking loss probe', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    recordBreadcrumb.mockClear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('attributes a lasting alternate-screen loss to the Orca reset that caused it', () => {
    const harness = createProbeHarness()
    harness.parse('h', 1002, 'drag')
    harness.probe.noteOrcaWrite(POST_REPLAY_REATTACH_RESET)
    harness.setReplaying(true)
    harness.parse('l', 1002, 'none')
    vi.advanceTimersByTime(600)

    expect(recordBreadcrumb).toHaveBeenCalledWith(
      'terminal_mouse_tracking_lost',
      expect.objectContaining({
        source: 'orca-replay',
        orcaReset: 'reattach',
        previousMode: 'drag'
      })
    )
  })

  it('ignores a reset that the same restore immediately re-arms', () => {
    const harness = createProbeHarness()
    harness.parse('h', 1002, 'drag')
    harness.parse('l', 1002, 'none')
    harness.parse('h', 1002, 'drag')
    vi.advanceTimersByTime(600)

    expect(recordBreadcrumb).not.toHaveBeenCalled()
  })

  it('reports wheel input that xterm turns into arrow keys at most once per interval', () => {
    const harness = createProbeHarness()
    harness.wheel()
    harness.wheel()
    vi.advanceTimersByTime(31_000)
    harness.wheel()

    expect(recordBreadcrumb).toHaveBeenCalledTimes(2)
    expect(recordBreadcrumb).toHaveBeenCalledWith(
      'terminal_wheel_arrow_fallback',
      expect.objectContaining({ everArmed: false, msSinceLoss: null })
    )
  })
})
