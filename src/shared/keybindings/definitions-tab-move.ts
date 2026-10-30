import type { KeybindingDefinition } from './types'
import { platformBindings } from './definitions-support'

export const TAB_MOVE_KEYBINDING_DEFINITIONS: readonly KeybindingDefinition[] = [
  {
    id: 'tab.moveLeft',
    title: 'Move active tab left',
    group: 'Tab Navigation',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'tab', 'move', 'left', 'split', 'group'],
    defaultBindings: platformBindings([]),
    allowInTerminal: true
  },
  {
    id: 'tab.moveRight',
    title: 'Move active tab right',
    group: 'Tab Navigation',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'tab', 'move', 'right', 'split', 'group'],
    defaultBindings: platformBindings(['Mod+Alt+ArrowRight']),
    allowInTerminal: true
  },
  {
    id: 'tab.moveUp',
    title: 'Move active tab up',
    group: 'Tab Navigation',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'tab', 'move', 'up', 'split', 'group'],
    defaultBindings: platformBindings([]),
    allowInTerminal: true
  },
  {
    id: 'tab.moveDown',
    title: 'Move active tab down',
    group: 'Tab Navigation',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'tab', 'move', 'down', 'split', 'group'],
    defaultBindings: platformBindings([]),
    allowInTerminal: true
  }
]
