import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import type { SleepingAgentLaunchConfig } from '../../../shared/agent-session-resume'
import {
  AGENT_LAUNCH_PROFILE_AGENTS,
  isProfileAgent
} from '../../../shared/agent-launch-profile-agents'
import type { AutomationRun } from '../../../shared/automations-types'
import type { TuiAgent } from '../../../shared/tui-agent'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import type { AppState } from '@/store/types'

export type ReusableAutomationSession = {
  tabId: string
  ptyId: string
  paneKey: string
}

type ReusablePaneState = Pick<
  AppState,
  'agentStatusByPaneKey' | 'ptyIdsByTabId' | 'terminalLayoutsByTabId'
> &
  Partial<Pick<AppState, 'agentLaunchConfigByPaneKey'>>

export function findReusableAutomationSession(args: {
  automationId: string
  agentId: TuiAgent
  worktreeId: string
  currentRunId: string
  runs: AutomationRun[]
  /** The config a fresh launch would use; a pane launched under another account is not reused. */
  expectedLaunchConfig?: SleepingAgentLaunchConfig
  state: ReusablePaneState & Pick<AppState, 'unifiedTabsByWorktree'>
}): ReusableAutomationSession | null {
  const { automationId, agentId, worktreeId, currentRunId, runs, expectedLaunchConfig, state } =
    args
  const worktreeTabs = state.unifiedTabsByWorktree[worktreeId] ?? []
  const terminalTabIds = new Set(
    worktreeTabs.filter((tab) => tab.contentType === 'terminal').map((tab) => tab.entityId)
  )
  const candidates = runs
    .filter(
      (run) =>
        run.id !== currentRunId &&
        run.automationId === automationId &&
        run.workspaceId === worktreeId &&
        run.status === 'completed' &&
        Boolean(run.terminalPaneKey) &&
        Boolean(run.terminalPtyId)
    )
    .sort((left, right) => right.createdAt - left.createdAt)

  for (const run of candidates) {
    const exactPane = findReusableExactRunPane({
      state,
      terminalTabIds,
      agentId,
      expectedLaunchConfig,
      run
    })
    if (exactPane) {
      return exactPane
    }
  }
  return null
}

function findReusableExactRunPane({
  state,
  terminalTabIds,
  agentId,
  expectedLaunchConfig,
  run
}: {
  state: ReusablePaneState
  terminalTabIds: Set<string>
  agentId: TuiAgent
  expectedLaunchConfig: SleepingAgentLaunchConfig | undefined
  run: AutomationRun
}): ReusableAutomationSession | null {
  if (!run.terminalPaneKey || !run.terminalPtyId) {
    return null
  }
  const parsed = parsePaneKey(run.terminalPaneKey)
  if (!parsed || !terminalTabIds.has(parsed.tabId)) {
    return null
  }
  const entry = state.agentStatusByPaneKey[run.terminalPaneKey]
  if (!entry || !isReusableAgentStatus(entry, agentId)) {
    return null
  }
  if (!launchAccountMatches(state, run.terminalPaneKey, agentId, expectedLaunchConfig)) {
    return null
  }
  if (!isRunPtyLiveInPane(state, parsed.tabId, parsed.leafId, run.terminalPtyId)) {
    return null
  }
  return { tabId: parsed.tabId, ptyId: run.terminalPtyId, paneKey: run.terminalPaneKey }
}

function isReusableAgentStatus(entry: AgentStatusEntry, agentId: TuiAgent): boolean {
  if (entry.state !== 'done') {
    return false
  }
  return !entry.agentType || entry.agentType === 'unknown' || entry.agentType === agentId
}

function launchAccountMatches(
  state: ReusablePaneState,
  paneKey: string,
  agentId: TuiAgent,
  expectedLaunchConfig: SleepingAgentLaunchConfig | undefined
): boolean {
  if (!expectedLaunchConfig || !isProfileAgent(agentId)) {
    return true
  }
  const accountEnvironmentName = AGENT_LAUNCH_PROFILE_AGENTS[agentId].accountEnvironmentName
  const expectedAccount = expectedLaunchConfig.agentEnv[accountEnvironmentName]
  const recorded = state.agentLaunchConfigByPaneKey?.[paneKey]?.launchConfig
  // Why: without a recorded launch only the default account can be assumed.
  return recorded
    ? recorded.agentEnv[accountEnvironmentName] === expectedAccount
    : expectedAccount === undefined
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
