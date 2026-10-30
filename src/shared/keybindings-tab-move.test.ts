import { describe, expect, it } from 'vitest'
import {
  getEffectiveKeybindingsForAction,
  getKeybindingDefinition,
  isKeybindingActionId,
  TAB_MOVE_ACTIONS
} from './keybindings'
import type { KeybindingPlatform } from './keybindings'

const PLATFORMS: readonly KeybindingPlatform[] = ['darwin', 'linux', 'win32']

describe('directional tab move keybindings', () => {
  it.each(TAB_MOVE_ACTIONS)(
    'registers $actionId under Tab Navigation',
    ({ actionId, direction }) => {
      expect(isKeybindingActionId(actionId)).toBe(true)
      expect(getKeybindingDefinition(actionId)).toMatchObject({
        id: actionId,
        title: `Move active tab ${direction}`,
        group: 'Tab Navigation',
        scope: 'tabs',
        allowInTerminal: true
      })
    }
  )

  it('gives move-right the history-forward chord and leaves other moves unbound', () => {
    for (const platform of PLATFORMS) {
      for (const { actionId } of TAB_MOVE_ACTIONS) {
        expect(getEffectiveKeybindingsForAction(actionId, platform)).toEqual(
          actionId === 'tab.moveRight' ? ['Mod+Alt+ArrowRight'] : []
        )
      }
      expect(getEffectiveKeybindingsForAction('worktree.history.forward', platform)).toEqual([])
      expect(getEffectiveKeybindingsForAction('worktree.history.back', platform)).toEqual([
        'Mod+Alt+ArrowLeft'
      ])
    }
  })
})
