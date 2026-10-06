import { describe, expect, it } from 'vitest'
import type { KeybindingOverrides } from './keybindings'
import { resolveWindowShortcutAction } from './window-shortcut-policy'

describe('resolveWindowShortcutAction worktree history chord', () => {
  it('claims only the default worktree-history back chord despite carrying Alt', () => {
    expect(
      resolveWindowShortcutAction(
        {
          code: 'ArrowLeft',
          key: 'ArrowLeft',
          meta: true,
          control: false,
          alt: true,
          shift: false
        },
        'darwin'
      )
    ).toEqual({ type: 'worktreeHistoryNavigate', direction: 'back' })

    expect(
      resolveWindowShortcutAction(
        {
          code: 'ArrowRight',
          key: 'ArrowRight',
          meta: true,
          control: false,
          alt: true,
          shift: false
        },
        'darwin'
      )
    ).toBeNull()

    expect(
      resolveWindowShortcutAction(
        {
          code: 'ArrowLeft',
          key: 'ArrowLeft',
          meta: false,
          control: true,
          alt: true,
          shift: false
        },
        'linux'
      )
    ).toEqual({ type: 'worktreeHistoryNavigate', direction: 'back' })
  })

  it('resolves a user-bound worktree-history forward chord', () => {
    const overrides: KeybindingOverrides = {
      'worktree.history.forward': ['Mod+Alt+ArrowRight']
    }

    expect(
      resolveWindowShortcutAction(
        {
          code: 'ArrowRight',
          key: 'ArrowRight',
          meta: true,
          control: false,
          alt: true,
          shift: false
        },
        'darwin',
        overrides
      )
    ).toEqual({ type: 'worktreeHistoryNavigate', direction: 'forward' })
  })

  it('rejects the history chord when Shift is also held', () => {
    expect(
      resolveWindowShortcutAction(
        {
          code: 'ArrowLeft',
          key: 'ArrowLeft',
          meta: true,
          control: false,
          alt: true,
          shift: true
        },
        'darwin'
      )
    ).toBeNull()
  })

  it('leaves Alt+Arrow without a primary modifier untouched (word-nav territory)', () => {
    expect(
      resolveWindowShortcutAction(
        {
          code: 'ArrowLeft',
          key: 'ArrowLeft',
          meta: false,
          control: false,
          alt: true,
          shift: false
        },
        'darwin'
      )
    ).toBeNull()
  })

  it('ignores Cmd/Ctrl+Alt combined with ArrowUp or ArrowDown', () => {
    // Why: the history predicate explicitly narrows to ArrowLeft/ArrowRight.
    // Cmd+Alt+Up / Cmd+Alt+Down must fall through to null so the event
    // reaches the renderer/PTTY (e.g. shells / readline).
    expect(
      resolveWindowShortcutAction(
        {
          code: 'ArrowUp',
          key: 'ArrowUp',
          meta: true,
          control: false,
          alt: true,
          shift: false
        },
        'darwin'
      )
    ).toBeNull()

    expect(
      resolveWindowShortcutAction(
        {
          code: 'ArrowDown',
          key: 'ArrowDown',
          meta: false,
          control: true,
          alt: true,
          shift: false
        },
        'linux'
      )
    ).toBeNull()
  })

  it('rejects the history chord when the opposite primary modifier is also held', () => {
    // Why: Cmd+Ctrl+Alt+Arrow on macOS collides with Mission Control space
    // switching; Ctrl+Meta+Alt+Arrow on Linux collides with GNOME workspace
    // switching. The app must not intercept either.
    expect(
      resolveWindowShortcutAction(
        {
          code: 'ArrowLeft',
          key: 'ArrowLeft',
          meta: true,
          control: true,
          alt: true,
          shift: false
        },
        'darwin'
      )
    ).toBeNull()

    expect(
      resolveWindowShortcutAction(
        {
          code: 'ArrowRight',
          key: 'ArrowRight',
          meta: true,
          control: true,
          alt: true,
          shift: false
        },
        'linux'
      )
    ).toBeNull()
  })

  it('still returns null for other Cmd/Ctrl+Alt combos (not an allowlist escape)', () => {
    // Why: regression guard — the history early-return must not swallow
    // unrelated primary+alt chords in a way that changes their old null
    // result. A future addition that intentionally consumes e.g. Cmd+Alt+KeyY
    // must add a new branch explicitly.
    expect(
      resolveWindowShortcutAction(
        {
          code: 'KeyY',
          key: 'y',
          meta: true,
          control: false,
          alt: true,
          shift: false
        },
        'darwin'
      )
    ).toBeNull()
  })
})
