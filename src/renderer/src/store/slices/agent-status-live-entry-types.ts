import type { AppState } from '../types'
import type {
  AgentStatusEntry,
  MigrationUnsupportedPtyEntry
} from '../../../../shared/agent-status-types'
import type {
  AgentProviderSessionMetadata,
  SleepingAgentLaunchConfig,
  SleepingAgentSessionRecord
} from '../../../../shared/agent-session-resume'
import type {
  AgentStatusMetadata,
  AgentStatusPayload,
  AgentStatusRouting,
  AgentStatusTiming
} from './agent-status-contract'

export type AgentStatusLiveEntryBuild = {
  entry: AgentStatusEntry
  existing: AgentStatusEntry | undefined
  existingSleepingRecord: SleepingAgentSessionRecord | undefined
  liveRecoveryRecord: SleepingAgentSessionRecord | null
  launchConfigSource: SleepingAgentLaunchConfig | undefined
  registryEntry: AppState['agentLaunchConfigByPaneKey'][string] | undefined
  registryMatched: boolean
  providerSession: AgentProviderSessionMetadata | undefined
  providerSessionChanged: boolean
  retainsResumableRecoveryIdentity: boolean
  migrationUnsupported: {
    next: Record<string, MigrationUnsupportedPtyEntry>
    changed: boolean
  }
  commandCodeNewTurn: boolean
  sortRelevantChange: boolean
  retentionRelevantChange: boolean
  completionRefreshWorktreeId: string | null
  boundaryResolved: boolean
}

export type AgentStatusLiveEntryRejection = {
  entry: null
  reason: 'stale' | 'suppressed-inherited-terminal'
}

export type AgentStatusLiveEntryArgs = {
  state: AppState
  paneKey: string
  payload: AgentStatusPayload
  terminalTitle?: string
  timing?: AgentStatusTiming
  routing?: AgentStatusRouting
  metadata?: AgentStatusMetadata
  updatedAt: number
}
