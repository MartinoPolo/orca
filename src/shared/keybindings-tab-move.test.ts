import { describe, expect, it } from 'vitest'
import {
  getEffectiveKeybindingsForAction,
  getKeybindingDefinition,
  isKeybindingActionId,
  TAB_MOVE_ACTIONS
} from './keybindings'
import type { KeybindingPlatform } from './keybindings'
import { PLUGIN_COMMAND_ALIAS_ACTION_IDS } from './plugins/plugin-command-actions'

const PLATFORMS: readonly KeybindingPlatform[] = ['darwin', 'linux', 'win32']

describe('directional tab move keybindings', () => {
  it.each(TAB_MOVE_ACTIONS)(
    'registers $actionId under Tab Navigation',
    ({ actionId, direction }) => {
      expect(isKeybindingActionId(actionId)).toBe(true)
      expect(PLUGIN_COMMAND_ALIAS_ACTION_IDS).toContain(actionId)
      expect(getKeybindingDefinition(actionId)).toMatchObject({
        id: actionId,
        title: `Move active tab ${direction}`,
        group: 'Tab Navigation',
        scope: 'tabs',
        allowInTerminal: true
      })
    }
  )

  it('assigns only move right by default and releases history forward', () => {
    for (const platform of PLATFORMS) {
      expect(getEffectiveKeybindingsForAction('tab.moveLeft', platform)).toEqual([])
      expect(getEffectiveKeybindingsForAction('tab.moveRight', platform)).toEqual([
        'Mod+Alt+ArrowRight'
      ])
      expect(getEffectiveKeybindingsForAction('tab.moveUp', platform)).toEqual([])
      expect(getEffectiveKeybindingsForAction('tab.moveDown', platform)).toEqual([])
      expect(getEffectiveKeybindingsForAction('worktree.history.forward', platform)).toEqual([])
    }
  })
})
