import { describe, expect, it } from 'vitest'
import type { PaneForegroundAgentEntry } from '../../store/slices/pane-foreground-agent'
import { hasCtrlEnterCsiUAuthorityForPane } from './terminal-ctrl-enter'
import { resolveTerminalShortcutAction } from './terminal-shortcut-policy'

const PANE_KEY = 'tab:pane'
const CTRL_ENTER = {
  key: 'Enter',
  code: 'Enter',
  metaKey: false,
  ctrlKey: true,
  altKey: false,
  shiftKey: false
}

function resolveLocalConptyCtrlEnter(foreground: PaneForegroundAgentEntry, terminalTitle?: string) {
  const state = { paneForegroundAgentByPaneKey: { [PANE_KEY]: foreground } }
  return resolveTerminalShortcutAction(
    CTRL_ENTER,
    false,
    'false',
    0,
    true,
    undefined,
    () => true,
    () => 0,
    undefined,
    undefined,
    () => true,
    'orca-first',
    () => hasCtrlEnterCsiUAuthorityForPane(state, PANE_KEY, terminalTitle)
  )
}

describe('hasCtrlEnterCsiUAuthorityForPane', () => {
  it('authorizes only trusted Ctrl+Enter CSI-u consumers', () => {
    for (const agent of ['droid', 'grok', 'pi'] as const) {
      expect(
        hasCtrlEnterCsiUAuthorityForPane(
          {
            paneForegroundAgentByPaneKey: {
              [PANE_KEY]: { agent, routingTrusted: true, shellForeground: false }
            }
          },
          PANE_KEY
        )
      ).toBe(true)
    }
    expect(
      hasCtrlEnterCsiUAuthorityForPane(
        {
          paneForegroundAgentByPaneKey: {
            [PANE_KEY]: { agent: 'claude', routingTrusted: true, shellForeground: false }
          }
        },
        PANE_KEY
      )
    ).toBe(false)
  })

  it('sends CSI-u to trusted Pi without kitty negotiation', () => {
    expect(
      resolveLocalConptyCtrlEnter({
        agent: 'pi',
        routingTrusted: true,
        shellForeground: false
      })
    ).toEqual({ type: 'sendInput', data: '\x1b[13;5u' })
  })

  it('falls back to CR when Pi routing is revoked or the shell is foreground', () => {
    expect(
      resolveLocalConptyCtrlEnter({
        agent: 'pi',
        routingTrusted: true,
        routingRevoked: true,
        shellForeground: false
      })
    ).toEqual({ type: 'sendInput', data: '\r' })
    expect(
      resolveLocalConptyCtrlEnter({
        agent: 'pi',
        routingTrusted: true,
        shellForeground: true
      })
    ).toEqual({ type: 'sendInput', data: '\r' })
  })

  it('uses a committed Pi title during an unrevoked trust gap', () => {
    expect(
      resolveLocalConptyCtrlEnter({ agent: 'pi', shellForeground: false }, 'Pi ready')
    ).toEqual({ type: 'sendInput', data: '\x1b[13;5u' })
  })

  it('uses strict titles only through unrevoked trust gaps', () => {
    const state = {
      paneForegroundAgentByPaneKey: {
        [PANE_KEY]: { agent: 'droid' as const, shellForeground: false }
      }
    }
    expect(hasCtrlEnterCsiUAuthorityForPane(state, PANE_KEY, '⠋ Droid')).toBe(true)
    expect(hasCtrlEnterCsiUAuthorityForPane(state, PANE_KEY, 'C:\\work\\grok-project')).toBe(false)
    expect(
      hasCtrlEnterCsiUAuthorityForPane(
        {
          paneForegroundAgentByPaneKey: {
            [PANE_KEY]: { agent: 'pi', shellForeground: false }
          }
        },
        PANE_KEY,
        'Droid'
      )
    ).toBe(false)

    for (const foreground of [
      { agent: 'grok' as const, routingRevoked: true, shellForeground: false },
      { agent: null, shellForeground: true },
      { agent: 'droid' as const, routingTrusted: true, shellForeground: true }
    ]) {
      expect(
        hasCtrlEnterCsiUAuthorityForPane(
          { paneForegroundAgentByPaneKey: { [PANE_KEY]: foreground } },
          PANE_KEY,
          'Grok'
        )
      ).toBe(false)
    }
  })
})
