import { app } from 'electron'
import type { GlobalSettings } from '../../shared/global-settings-types'
import { AGENT_HOOK_TARGETS, type AgentHookTarget } from '../../shared/agent-hook-types'
import { normalizeAgentLaunchProfiles } from '../../shared/agent-launch-profiles'
import { haveSameDisabledTuiAgents } from '../../shared/tui-agent-selection'
import {
  applyAgentStatusHooksEnabled,
  reconcileClaudeLaunchProfileHooks
} from '../agent-hooks/managed-agent-hook-controls'
import { recordManagedHookInstallFailure } from '../agent-hooks/install-telemetry'
import { activeSessions } from './ssh-active-relay-sessions'

type ManagedHookSettings = Pick<
  GlobalSettings,
  'agentStatusHooksEnabled' | 'disabledTuiAgents' | 'claudeLaunchProfiles'
> &
  Partial<Pick<GlobalSettings, 'agentCmdOverrides'>>

export async function reconcileSettingsManagedHooks(
  store: { getSettings: () => ManagedHookSettings },
  before: ManagedHookSettings,
  settings: ManagedHookSettings,
  updates: Partial<GlobalSettings>
): Promise<void> {
  const hookSettingChanged =
    ('agentStatusHooksEnabled' in updates &&
      before.agentStatusHooksEnabled !== settings.agentStatusHooksEnabled) ||
    ('disabledTuiAgents' in updates &&
      !haveSameDisabledTuiAgents(before.disabledTuiAgents, settings.disabledTuiAgents))
  const claudeProfilesChanged =
    'claudeLaunchProfiles' in updates &&
    JSON.stringify(normalizeAgentLaunchProfiles(before.claudeLaunchProfiles)) !==
      JSON.stringify(normalizeAgentLaunchProfiles(settings.claudeLaunchProfiles))
  if (!hookSettingChanged && !claudeProfilesChanged) {
    return
  }
  const options = {
    userInitiated: true,
    shouldHydrateShellPath: app.isPackaged,
    onInstallError: recordManagedHookInstallFailure,
    shouldContinue: (agent: AgentHookTarget) => {
      const current = store.getSettings()
      return current.agentStatusHooksEnabled !== false && !current.disabledTuiAgents.includes(agent)
    }
  }
  const reconciliations: Promise<unknown>[] = []
  if (claudeProfilesChanged) {
    reconciliations.push(reconcileClaudeLaunchProfileHooks(before, settings, options))
    for (const session of activeSessions.values()) {
      reconciliations.push(
        Promise.resolve().then(() => session.reconcileClaudeLaunchProfileHooks())
      )
    }
  }
  if (hookSettingChanged) {
    reconciliations.push(
      applyAgentStatusHooksEnabled(settings.agentStatusHooksEnabled, settings, {
        ...options,
        ...(claudeProfilesChanged
          ? { agents: AGENT_HOOK_TARGETS.filter((agent) => agent !== 'claude') }
          : {})
      })
    )
  }
  for (const reconciliation of await Promise.allSettled(reconciliations)) {
    if (reconciliation.status === 'rejected') {
      console.warn('[settings] failed to reconcile managed agent hooks:', reconciliation.reason)
    }
  }
}
