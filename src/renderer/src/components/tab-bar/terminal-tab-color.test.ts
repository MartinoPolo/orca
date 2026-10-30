import { describe, expect, it } from 'vitest'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import {
  getTerminalTabTintBackground,
  getTerminalTabTintPresentation,
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

function identityColor(
  tab: Partial<Pick<TerminalTab, 'color' | 'launchKind'>>,
  agent: Parameters<typeof resolveTerminalTabIdentityTint>[1]
): string | undefined {
  return resolveTerminalTabIdentityTint({ color: null, ...tab }, agent)?.color
}

describe('terminal tab identity tint', () => {
  it('leaves ordinary terminals neutral and tints command launches', () => {
    expect(identityColor({}, null)).toBeUndefined()
    expect(identityColor({ launchKind: 'command' }, null)).toBe(expectedTintColor.command)
  })

  it('uses the running agent before command provenance', () => {
    expect(identityColor({}, 'claude')).toBe(expectedTintColor.claude)
    expect(identityColor({}, 'pi')).toBe(expectedTintColor.pi)
    expect(identityColor({ launchKind: 'command' }, 'pi')).toBe(expectedTintColor.pi)
    expect(identityColor({ launchKind: 'command' }, 'codex')).toBeUndefined()
  })

  it('keeps an explicit manual color and an explicit neutral over automatic identity', () => {
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
    expect(resolveTerminalTabStateTintName('failed', false)).toBe('attention')
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

describe('terminal tab tint presentation', () => {
  const claudeTab = { color: null, launchKind: undefined }

  it('marks an inactive identity tab with a softened underline and no fill', () => {
    const tint = getTerminalTabTintPresentation({
      tab: claudeTab,
      agent: 'claude',
      activityStatus: 'done',
      showUnreadActivity: false,
      isActive: false
    })
    expect(tint.isFilled).toBe(false)
    expect(tint.rootStyle).toBeUndefined()
    expect(tint.showIndicator).toBe(true)
    expect(tint.indicatorStyle?.backgroundColor).toBe(
      'color-mix(in srgb, var(--tab-tint-claude) 70%, var(--card))'
    )
  })

  it('fills an inactive tab that needs the user with the state tint', () => {
    const tint = getTerminalTabTintPresentation({
      tab: claudeTab,
      agent: 'claude',
      activityStatus: 'permission',
      showUnreadActivity: false,
      isActive: false
    })
    expect(tint.isFilled).toBe(true)
    expect(tint.rootStyle?.backgroundColor).toBe(
      getTerminalTabTintBackground(TERMINAL_TAB_TINTS.attention)
    )
    expect(tint.rootAttributes).toEqual({
      'data-tab-color': 'var(--tab-tint-claude)',
      'data-tab-state': 'attention'
    })
  })

  it('keeps an inactive neutral tab bare', () => {
    const tint = getTerminalTabTintPresentation({
      tab: { color: '' },
      agent: 'claude',
      activityStatus: 'done',
      showUnreadActivity: false,
      isActive: false
    })
    expect(tint.isFilled).toBe(false)
    expect(tint.showIndicator).toBe(false)
  })
})
