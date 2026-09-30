import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { TerminalTabActivityStatus } from './terminal-tab-activity-status'

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

export type TerminalTabTint = {
  color: string
  inactiveMixPercent: number
  activeMixPercent: number
}

// Why: sky and green need a stronger mix than violet or the warm state hues to stay apart on dark surfaces.
export const TERMINAL_TAB_TINTS = {
  pi: { color: 'var(--tab-tint-pi)', inactiveMixPercent: 24, activeMixPercent: 34 },
  claude: { color: 'var(--tab-tint-claude)', inactiveMixPercent: 28, activeMixPercent: 40 },
  command: { color: 'var(--tab-tint-command)', inactiveMixPercent: 28, activeMixPercent: 40 },
  unread: { color: 'var(--tab-tint-unread)', inactiveMixPercent: 26, activeMixPercent: 36 },
  attention: { color: 'var(--tab-tint-attention)', inactiveMixPercent: 30, activeMixPercent: 40 }
} as const satisfies Record<string, TerminalTabTint>

function manualTint(color: string): TerminalTabTint {
  return { color, inactiveMixPercent: 22, activeMixPercent: 34 }
}

export function resolveTerminalTabIdentityTint(
  tab: TerminalTab,
  agent: TuiAgent | null
): TerminalTabTint | null {
  // Empty string is the explicit neutral choice; null retains automatic coloring.
  if (tab.color !== null) {
    return tab.color ? manualTint(tab.color) : null
  }
  if (agent === 'claude') {
    return TERMINAL_TAB_TINTS.claude
  }
  if (agent === 'pi' || (!agent && tab.launchKind === 'piw')) {
    return TERMINAL_TAB_TINTS.pi
  }
  if (agent) {
    return null
  }
  return tab.launchKind === 'command' ? TERMINAL_TAB_TINTS.command : null
}

export type TerminalTabStateTintName = 'attention' | 'unread'

export function resolveTerminalTabStateTintName(
  activityStatus: TerminalTabActivityStatus,
  showUnreadActivity: boolean
): TerminalTabStateTintName | null {
  if (activityStatus === 'permission' || activityStatus === 'interrupted') {
    return 'attention'
  }
  return showUnreadActivity ? 'unread' : null
}

export function getTerminalTabTintBackground(tint: TerminalTabTint, isActive: boolean): string {
  const mixPercent = isActive ? tint.activeMixPercent : tint.inactiveMixPercent
  return `color-mix(in srgb, ${tint.color} ${mixPercent}%, var(--card))`
}
