import type { AgentHookInstallStatus, AgentHookTarget } from '../../shared/agent-hook-types'

export function errorStatus(agent: AgentHookTarget, error: unknown): AgentHookInstallStatus {
  return {
    agent,
    state: 'error',
    configPath: '',
    managedHooksPresent: false,
    detail: error instanceof Error ? error.message : String(error)
  }
}

export function skippedStatus(
  agent: AgentHookTarget,
  skipReason: NonNullable<AgentHookInstallStatus['skipReason']>,
  detail: string
): AgentHookInstallStatus {
  return {
    agent,
    state: 'skipped',
    configPath: '',
    managedHooksPresent: false,
    detail,
    skipReason
  }
}
