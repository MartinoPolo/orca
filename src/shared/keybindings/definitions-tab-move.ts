import type { KeybindingDefinition } from './types'
import { platformBindings } from './definitions-support'

export const TAB_MOVE_KEYBINDING_DEFINITIONS: readonly KeybindingDefinition[] = [
  {
    id: 'tab.moveToPaneLeft',
    title: 'Move active tab to pane left',
    group: 'Tab Navigation',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'tab', 'move', 'left', 'split', 'group'],
    defaultBindings: platformBindings([]),
    allowInTerminal: true
  },
  {
    id: 'tab.moveToPaneRight',
    title: 'Move active tab to pane right',
    group: 'Tab Navigation',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'tab', 'move', 'right', 'split', 'group'],
    defaultBindings: platformBindings([]),
    allowInTerminal: true
  },
  {
    id: 'tab.moveToPaneUp',
    title: 'Move active tab to pane up',
    group: 'Tab Navigation',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'tab', 'move', 'up', 'split', 'group'],
    defaultBindings: platformBindings([]),
    allowInTerminal: true
  },
  {
    id: 'tab.moveToPaneDown',
    title: 'Move active tab to pane down',
    group: 'Tab Navigation',
    scope: 'tabs',
    searchKeywords: ['shortcut', 'tab', 'move', 'down', 'split', 'group'],
    defaultBindings: platformBindings([]),
    allowInTerminal: true
  }
]
