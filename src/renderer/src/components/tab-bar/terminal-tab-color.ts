import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import type { TerminalAgent } from '../../../../shared/terminal-agent'
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
  mixPercent: number
}

// Why: mixes stay light enough to read as color yet keep white text above 5.5:1 on the dark card.
export const TERMINAL_TAB_TINTS = {
  pi: { color: 'var(--tab-tint-pi)', mixPercent: 48 },
  claude: { color: 'var(--tab-tint-claude)', mixPercent: 46 },
  command: { color: 'var(--tab-tint-command)', mixPercent: 40 },
  unread: { color: 'var(--tab-tint-unread)', mixPercent: 42 },
  attention: { color: 'var(--tab-tint-attention)', mixPercent: 48 }
} as const satisfies Record<string, TerminalTabTint>

const INACTIVE_UNDERLINE_MIX_PERCENT = 70

function manualTint(color: string): TerminalTabTint {
  return { color, mixPercent: 40 }
}

export function resolveTerminalTabIdentityTint(
  tab: TerminalTab,
  agent: TerminalAgent | null
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

// Why: an inactive background always means the tab needs the user; identity fills only the selected tab.
export function resolveTerminalTabBackgroundTint(
  identityTint: TerminalTabTint | null,
  stateTintName: TerminalTabStateTintName | null,
  isActive: boolean
): TerminalTabTint | null {
  if (stateTintName) {
    return TERMINAL_TAB_TINTS[stateTintName]
  }
  return isActive ? identityTint : null
}

export function getTerminalTabTintBackground(tint: TerminalTabTint): string {
  return `color-mix(in srgb, ${tint.color} ${tint.mixPercent}%, var(--card))`
}

export function getTerminalTabUnderlineColor(tint: TerminalTabTint, isActive: boolean): string {
  return isActive
    ? tint.color
    : `color-mix(in srgb, ${tint.color} ${INACTIVE_UNDERLINE_MIX_PERCENT}%, var(--card))`
}
