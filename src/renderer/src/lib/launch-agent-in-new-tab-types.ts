import type { AgentStartupPlan } from '@/lib/tui-agent-startup'
import type { AgentSessionLaunchPlan } from '@/lib/agent-session-launch-plan'
import type { StructuredAgentLaunchSettlement } from '@/lib/structured-agent-launch-settlement'
import type { TuiAgent } from '../../../shared/tui-agent'
import type { LaunchSource } from '../../../shared/telemetry-events'
import type { PiLaunchProfile } from '../../../shared/pi-launch-profiles'

export type LaunchAgentInNewTabArgs = {
  agent: TuiAgent
  worktreeId: string
  groupId?: string
  prompt?: string
  agentArgs?: string | null
  piLaunchProfile?: PiLaunchProfile
  initialCwd?: string | null
  promptDelivery?: 'auto-submit' | 'draft' | 'submit-after-ready'
  launchSource?: LaunchSource
  quickCommandLabel?: string | null
  launchPlatform?: NodeJS.Platform
  onPromptDelivered?: () => void
  agentSessionLaunchPlan?: AgentSessionLaunchPlan
  beforeSurfaceOpen?: (
    surface:
      | { kind: 'local-terminal' }
      | { kind: 'local-agent-session'; sessionId: string }
      | { kind: 'host-published' }
  ) => boolean | void
}

export type AgentLaunchSurface =
  | { kind: 'local-terminal'; tabId: string }
  | { kind: 'local-agent-session'; tabId: string; sessionId: string }
  | { kind: 'host-published' }

export type LaunchAgentInNewTabResult = {
  surface: AgentLaunchSurface
  startupPlan: AgentStartupPlan
  pasteDraftAfterLaunch: boolean
  promptDeliveryResult?: Promise<{ delivered: boolean; failureNotified: boolean }>
  structuredSettlement?: Promise<StructuredAgentLaunchSettlement>
} | null
