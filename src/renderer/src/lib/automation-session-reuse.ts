import type { AutomationRun } from '../../../shared/automations-types'
import { findReusableAutomationRun } from '../../../shared/automation-session-reuse'
import type { TuiAgent } from '../../../shared/tui-agent'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import type { AppState } from '@/store/types'
import type { AutomationLaunchAccount } from '@/lib/automation-agent-profile'

export type ReusableAutomationSession = {
  tabId: string
  ptyId: string
  paneKey: string
}

export function findReusableAutomationSession(args: {
  automationId: string
  agentId: TuiAgent
  worktreeId: string
  currentRunId: string
  runs: AutomationRun[]
  /** The account a fresh launch would use; a pane launched under another one is not reused. */
  launchAccount?: AutomationLaunchAccount
  state: Pick<
    AppState,
    'agentStatusByPaneKey' | 'ptyIdsByTabId' | 'terminalLayoutsByTabId' | 'unifiedTabsByWorktree'
  > &
    Partial<Pick<AppState, 'agentLaunchConfigByPaneKey'>>
}): ReusableAutomationSession | null {
  const { state, launchAccount, ...selection } = args
  const terminalTabIds = new Set(
    (state.unifiedTabsByWorktree[args.worktreeId] ?? [])
      .filter((tab) => tab.contentType === 'terminal')
      .map((tab) => tab.entityId)
  )
  return findReusableAutomationRun({
    ...selection,
    agentStatusForPane: (paneKey) => state.agentStatusByPaneKey[paneKey],
    liveSession: (run) => {
      const parsed = parsePaneKey(run.terminalPaneKey)
      if (
        !parsed ||
        !terminalTabIds.has(parsed.tabId) ||
        !launchAccountMatches(state, run.terminalPaneKey, launchAccount) ||
        !isRunPtyLiveInPane(state, parsed.tabId, parsed.leafId, run.terminalPtyId)
      ) {
        return null
      }
      return { tabId: parsed.tabId, ptyId: run.terminalPtyId, paneKey: run.terminalPaneKey }
    }
  })
}

function launchAccountMatches(
  state: Partial<Pick<AppState, 'agentLaunchConfigByPaneKey'>>,
  paneKey: string,
  launchAccount: AutomationLaunchAccount | undefined
): boolean {
  if (!launchAccount) {
    return true
  }
  const recorded = state.agentLaunchConfigByPaneKey?.[paneKey]?.launchConfig
  // Without a recorded launch only the default account can be assumed.
  return recorded
    ? recorded.agentEnv[launchAccount.environmentName] === launchAccount.directory
    : launchAccount.directory === undefined
}

function isRunPtyLiveInPane(
  state: Pick<AppState, 'ptyIdsByTabId' | 'terminalLayoutsByTabId'>,
  tabId: string,
  leafId: string,
  ptyId: string
): boolean {
  if (!state.ptyIdsByTabId[tabId]?.includes(ptyId)) {
    return false
  }
  const layoutPtyId = state.terminalLayoutsByTabId[tabId]?.ptyIdsByLeafId?.[leafId]
  return layoutPtyId === undefined || layoutPtyId === ptyId
}
