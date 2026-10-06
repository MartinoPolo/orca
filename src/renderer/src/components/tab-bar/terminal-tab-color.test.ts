import { describe, expect, it } from 'vitest'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import {
  getTerminalTabTintBackground,
  getTerminalTabUnderlineColor,
  resolveTerminalTabBackgroundTint,
  resolveTerminalTabIdentityTint,
  resolveTerminalTabStateTintName,
  TERMINAL_TAB_TINTS
} from './terminal-tab-color'

const expectedTintColor = {
  claude: 'var(--tab-tint-claude)',
  pi: 'var(--tab-tint-pi)',
  command: 'var(--tab-tint-command)',
  manual: '#22c55e'
}

const tab: TerminalTab = {
  id: 'tab',
  ptyId: null,
  worktreeId: 'worktree',
  title: 'Terminal 1',
  customTitle: null,
  color: null,
  sortOrder: 0,
  createdAt: 0
}

function identityColor(
  tabOverrides: Partial<TerminalTab>,
  agent: Parameters<typeof resolveTerminalTabIdentityTint>[1]
): string | undefined {
  return resolveTerminalTabIdentityTint({ ...tab, ...tabOverrides }, agent)?.color
}

describe('terminal tab identity tint', () => {
  it('leaves ordinary terminals neutral and tints command launches', () => {
    expect(identityColor({}, null)).toBeUndefined()
    expect(identityColor({ launchKind: 'command' }, null)).toBe(expectedTintColor.command)
  })
  it('uses agent identity before command provenance and shares one tint across Pi accounts', () => {
    expect(identityColor({}, 'claude')).toBe(expectedTintColor.claude)
    expect(identityColor({}, 'pi')).toBe(expectedTintColor.pi)
    expect(identityColor({ launchKind: 'piw' }, 'pi')).toBe(expectedTintColor.pi)
    expect(identityColor({ launchKind: 'piw' }, null)).toBe(expectedTintColor.pi)
    expect(identityColor({ launchKind: 'command' }, 'pi')).toBe(expectedTintColor.pi)
    expect(identityColor({ launchKind: 'command' }, 'codex')).toBeUndefined()
    expect(identityColor({ quickCommandLabel: 'Agent prompt' }, null)).toBeUndefined()
  })
  it('keeps explicit manual color and explicit neutral over automatic identity', () => {
    expect(identityColor({ color: expectedTintColor.manual }, 'claude')).toBe(
      expectedTintColor.manual
    )
    expect(identityColor({ color: '' }, 'claude')).toBeUndefined()
  })
})

describe('terminal tab state tint', () => {
  it('gives attention priority over unread and ignores quiet or live working states', () => {
    expect(resolveTerminalTabStateTintName('permission', false)).toBe('attention')
    expect(resolveTerminalTabStateTintName('interrupted', true)).toBe('attention')
    expect(resolveTerminalTabStateTintName('done', true)).toBe('unread')
    expect(resolveTerminalTabStateTintName('inactive', true)).toBe('unread')
    expect(resolveTerminalTabStateTintName('working', false)).toBeNull()
    expect(resolveTerminalTabStateTintName('done', false)).toBeNull()
  })
  it('fills inactive tabs only for state and active tabs with identity', () => {
    const identity = { color: '#123456', mixPercent: 30 }
    expect(resolveTerminalTabBackgroundTint(identity, null, false)).toBeNull()
    expect(resolveTerminalTabBackgroundTint(identity, null, true)).toBe(identity)
    expect(resolveTerminalTabBackgroundTint(null, null, true)).toBeNull()
    expect(resolveTerminalTabBackgroundTint(identity, 'unread', false)).toBe(
      TERMINAL_TAB_TINTS.unread
    )
    expect(resolveTerminalTabBackgroundTint(identity, 'attention', true)).toBe(
      TERMINAL_TAB_TINTS.attention
    )
  })
  it('mixes the tint into the card and softens inactive underlines', () => {
    const tint = { color: '#123456', mixPercent: 30 }
    expect(getTerminalTabTintBackground(tint)).toBe('color-mix(in srgb, #123456 30%, var(--card))')
    expect(getTerminalTabUnderlineColor(tint, true)).toBe('#123456')
    expect(getTerminalTabUnderlineColor(tint, false)).toBe(
      'color-mix(in srgb, #123456 70%, var(--card))'
    )
  })
})
