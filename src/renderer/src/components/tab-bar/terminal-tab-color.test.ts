import { describe, expect, it } from 'vitest'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import {
  getTerminalTabTintBackground,
  resolveTerminalTabIdentityTint,
  resolveTerminalTabStateTintName
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
  it('mixes a stronger tint into the card for the active tab', () => {
    const tint = { color: '#123456', inactiveMixPercent: 20, activeMixPercent: 30 }
    expect(getTerminalTabTintBackground(tint, false)).toBe(
      'color-mix(in srgb, #123456 20%, var(--card))'
    )
    expect(getTerminalTabTintBackground(tint, true)).toBe(
      'color-mix(in srgb, #123456 30%, var(--card))'
    )
  })
})
