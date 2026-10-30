import type { ParsedAgentStatusPayload } from '../../../shared/agent-status-types'
import type { LaunchSource } from '../../../shared/telemetry-events'
import type { TuiAgent } from '../../../shared/tui-agent'
import type { AgentStartupPlan } from '@/lib/tui-agent-startup'
import type { AutomationTerminalOwnership } from '@/lib/automation-terminal-ownership'
import type { AgentLaunchProfile } from '../../../shared/agent-launch-profiles'

export type LaunchAgentBackgroundSessionArgs = {
  agent: TuiAgent
  worktreeId: string
  prompt?: string
  /** An automation's saved extras, merged over this host's default Arguments. */
  extraAgentArgs?: string
  /** The automation's pinned account; an unavailable profile fails the launch. */
  agentLaunchProfile?: AgentLaunchProfile
  launchSource?: LaunchSource
  title?: string
  onData?: (chunk: string) => void
  onExit?: (ptyId: string, code: number) => void
  onAgentStatus?: (payload: ParsedAgentStatusPayload) => void
}

export type LaunchAgentBackgroundSessionResult = {
  tabId: string
  paneKey: string
  ptyId: string
  startupPlan: AgentStartupPlan
  terminalOwnership: AutomationTerminalOwnership | null
  /** Ends a remote runtime's exit wait and data stream; a no-op for local/SSH PTYs. */
  releaseRuntimeObservers: () => void
}
