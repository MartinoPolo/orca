import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import type { TuiAgent } from '../../../../shared/tui-agent'

export const TAB_COLOR_VALUES = {
  blue: '#3b82f6',
  purple: '#a855f7',
  pink: '#ec4899',
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  teal: '#14b8a6',
  gray: '#9ca3af'
} as const

export function resolveTerminalTabColor(tab: TerminalTab, agent: TuiAgent | null): string | null {
  // Empty string is the explicit neutral choice; null retains automatic coloring.
  if (tab.color !== null) {
    return tab.color || null
  }
  if (agent === 'claude') {
    return TAB_COLOR_VALUES.orange
  }
  if (agent === 'pi') {
    return tab.launchKind === 'piw' ? TAB_COLOR_VALUES.purple : TAB_COLOR_VALUES.blue
  }
  if (agent) {
    return null
  }
  if (tab.launchKind === 'piw') {
    return TAB_COLOR_VALUES.purple
  }
  return tab.launchKind === 'command' ? TAB_COLOR_VALUES.teal : null
}
