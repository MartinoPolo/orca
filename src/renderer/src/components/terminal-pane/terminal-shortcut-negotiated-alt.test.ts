import { describe, expect, it, vi } from 'vitest'
import { TerminalKittyKeyboardModeTracker } from '../../../../shared/terminal-kitty-keyboard-mode-tracker'
import { createTerminalOptionKittyReleaseTracker } from './terminal-option-kitty-release'
import {
  resolveTerminalShortcutAction,
  type TerminalShortcutEvent
} from './terminal-shortcut-policy'

function event(overrides: Partial<TerminalShortcutEvent>): TerminalShortcutEvent {
  return {
    key: 'p',
    code: 'KeyP',
    metaKey: false,
    ctrlKey: false,
    altKey: true,
    shiftKey: false,
    repeat: false,
    ...overrides
  }
}

function resolveAlt(
  input: TerminalShortcutEvent,
  flags: number,
  isWindows = true,
  layoutCharacterForCode?: (code: string, shifted: boolean) => string | undefined
): ReturnType<typeof resolveTerminalShortcutAction> {
  return resolveTerminalShortcutAction(
    input,
    false,
    'false',
    0,
    isWindows,
    undefined,
    undefined,
    () => flags,
    layoutCharacterForCode
  )
}

describe('negotiated non-Mac Alt encoding', () => {
  it.each([
    ['Windows', true],
    ['Linux', false]
  ] as const)('encodes Alt+P press and repeat on %s', (_platform, isWindows) => {
    expect(resolveAlt(event({}), 7, isWindows)).toEqual({
      type: 'sendInput',
      data: '\x1b[112;3u',
      optionKittyRelease: { flags: 7, primaryCodePoint: 112 }
    })
    expect(resolveAlt(event({ repeat: true }), 7, isWindows)).toEqual({
      type: 'sendInput',
      data: '\x1b[112;3:2u',
      optionKittyRelease: { flags: 7, primaryCodePoint: 112 }
    })
  })

  it('delegates Alt+P when enhanced keyboard encoding was not negotiated', () => {
    expect(resolveAlt(event({}), 0)).toBeNull()
  })

  it('uses native printable identity and retains a differing physical key as metadata', () => {
    expect(resolveAlt(event({ key: 'p', code: 'KeyQ' }), 7, false)).toEqual({
      type: 'sendInput',
      data: '\x1b[112::113;3u',
      optionKittyRelease: { flags: 7, primaryCodePoint: 112 }
    })
  })

  it('does not let a mismatched layout resolver replace native unshifted identity', () => {
    const layoutCharacterForCode = vi.fn(() => 'q')

    expect(resolveAlt(event({ key: 'p', code: 'KeyQ' }), 7, false, layoutCharacterForCode)).toEqual(
      {
        type: 'sendInput',
        data: '\x1b[112::113;3u',
        optionKittyRelease: { flags: 7, primaryCodePoint: 112 }
      }
    )
    expect(layoutCharacterForCode).not.toHaveBeenCalled()
  })

  it('normalizes uppercase CapsLock text to its unshifted primary identity', () => {
    expect(
      resolveAlt(event({ key: 'P', getModifierState: (modifier) => modifier === 'CapsLock' }), 7)
    ).toEqual({
      type: 'sendInput',
      data: '\x1b[112;67u',
      optionKittyRelease: { flags: 7, primaryCodePoint: 112 }
    })
  })

  it('delegates shifted printable, punctuation, and numpad chords to xterm', () => {
    const delegated = [
      event({ key: 'P', shiftKey: true }),
      event({ key: '?', code: 'Slash', shiftKey: true }),
      event({ key: '1', code: 'Numpad1' })
    ]

    for (const input of delegated) {
      expect(resolveAlt(input, 7)).toBeNull()
    }
  })

  it('preserves release ownership through the existing tracker', () => {
    const sendInput = vi.fn()
    const releases = createTerminalOptionKittyReleaseTracker()
    const press = event({})
    const action = resolveAlt(press, 7)

    expect(action?.type).toBe('sendInput')
    if (action?.type !== 'sendInput' || !action.optionKittyRelease) {
      throw new Error('Expected negotiated Alt press with release metadata')
    }
    releases.arm(press, action.optionKittyRelease, sendInput, () => 7)
    expect(releases.settle(event({}))).toBe(true)
    expect(sendInput).toHaveBeenCalledWith('\x1b[112;3:3u')
  })

  it('keeps native press identity when physical code differs and Alt is released first', () => {
    const sendInput = vi.fn()
    const releases = createTerminalOptionKittyReleaseTracker()
    const press = event({ key: 'p', code: 'KeyQ' })
    const action = resolveAlt(press, 7, false)

    expect(action?.type).toBe('sendInput')
    if (action?.type !== 'sendInput' || !action.optionKittyRelease) {
      throw new Error('Expected negotiated Alt press with release metadata')
    }
    releases.arm(press, action.optionKittyRelease, sendInput, () => 7)
    expect(releases.settle(event({ key: 'q', code: 'KeyQ', altKey: false }))).toBe(true)
    expect(sendInput).toHaveBeenCalledWith('\x1b[112::113;1:3u')
  })

  it('uses application state after snapshot reset and metadata restore', () => {
    const tracker = new TerminalKittyKeyboardModeTracker()
    tracker.scan('\x1b[>7u')
    const resolveTrackedAlt = () => resolveAlt(event({}), tracker.flags)

    expect(resolveTrackedAlt()).toMatchObject({ type: 'sendInput', data: '\x1b[112;3u' })
    tracker.resetForSnapshot()
    tracker.restoreSnapshotFlags(7)
    expect(resolveTrackedAlt()).toMatchObject({ type: 'sendInput', data: '\x1b[112;3u' })
  })

  it('leaves AltGr, Ctrl+Alt, Meta+Alt, and IME-owned keys untouched', () => {
    const untouched = [
      event({ key: '@', code: 'KeyQ', getModifierState: (modifier) => modifier === 'AltGraph' }),
      event({ key: '@', code: 'KeyQ', ctrlKey: true }),
      event({ metaKey: true }),
      event({ isComposing: true }),
      event({ keyCode: 229 }),
      event({ key: 'Dead' }),
      event({ key: 'Process' }),
      event({ key: 'Unidentified' })
    ]

    for (const input of untouched) {
      expect(resolveAlt(input, 7)).toBeNull()
    }
  })

  it('keeps Orca shortcut precedence over negotiated Alt encoding', () => {
    expect(resolveAlt(event({ key: 'd', code: 'KeyD', shiftKey: true }), 7)).toEqual({
      type: 'splitActivePane',
      direction: 'horizontal'
    })
  })
})
