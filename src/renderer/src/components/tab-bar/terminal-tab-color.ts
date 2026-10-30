import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import type { TerminalAgent } from '../../../../shared/terminal-agent'
import type { TerminalTabActivityStatus } from './terminal-tab-activity-status'

export type TerminalTabTintSource = Pick<TerminalTab, 'color' | 'launchKind'>

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

const MANUAL_TINT_MIX_PERCENT = 40
const INACTIVE_UNDERLINE_MIX_PERCENT = 70

export function resolveTerminalTabIdentityTint(
  tab: TerminalTabTintSource,
  agent: TerminalAgent | null
): TerminalTabTint | null {
  // Empty string is the explicit neutral choice; null keeps automatic identity.
  if (tab.color !== null) {
    return tab.color ? { color: tab.color, mixPercent: MANUAL_TINT_MIX_PERCENT } : null
  }
  if (agent === 'claude') {
    return TERMINAL_TAB_TINTS.claude
  }
  if (agent === 'pi') {
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
  if (
    activityStatus === 'permission' ||
    activityStatus === 'interrupted' ||
    activityStatus === 'failed'
  ) {
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

export type TerminalTabTintPresentation = {
  rootAttributes: { 'data-tab-color': string; 'data-tab-state': string }
  isFilled: boolean
  rootStyle: { backgroundColor: string } | undefined
  showIndicator: boolean
  indicatorStyle: { backgroundColor: string } | undefined
}

export function getTerminalTabTintPresentation(input: {
  tab: TerminalTabTintSource
  agent: TerminalAgent | null
  activityStatus: TerminalTabActivityStatus
  showUnreadActivity: boolean
  isActive: boolean
}): TerminalTabTintPresentation {
  const identityTint = resolveTerminalTabIdentityTint(input.tab, input.agent)
  const stateTintName = resolveTerminalTabStateTintName(
    input.activityStatus,
    input.showUnreadActivity
  )
  const backgroundTint = resolveTerminalTabBackgroundTint(
    identityTint,
    stateTintName,
    input.isActive
  )
  return {
    rootAttributes: {
      'data-tab-color': identityTint?.color ?? 'none',
      'data-tab-state': stateTintName ?? 'none'
    },
    isFilled: backgroundTint !== null,
    rootStyle: backgroundTint
      ? { backgroundColor: getTerminalTabTintBackground(backgroundTint) }
      : undefined,
    showIndicator: input.isActive || identityTint !== null,
    indicatorStyle: identityTint
      ? { backgroundColor: getTerminalTabUnderlineColor(identityTint, input.isActive) }
      : undefined
  }
}
