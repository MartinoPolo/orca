import { app } from 'electron'
import type { GlobalSettings } from '../../shared/global-settings-types'
import { AGENT_HOOK_TARGETS, type AgentHookTarget } from '../../shared/agent-hook-types'
import { normalizeAgentLaunchProfiles } from '../../shared/agent-launch-profiles'
import { haveSameDisabledTuiAgents } from '../../shared/tui-agent-selection'
import { isAgentStatusHooksEnabledForAgent } from '../../shared/agent-status-hooks-setting'
import {
  applyAgentStatusHooksEnabled,
  reconcileClaudeLaunchProfileHooks
} from '../agent-hooks/managed-agent-hook-controls'
import { recordManagedHookInstallFailure } from '../agent-hooks/install-telemetry'

type ManagedHookSettings = Pick<
  GlobalSettings,
  'agentStatusHooksEnabled' | 'disabledTuiAgents' | 'claudeLaunchProfiles'
> &
  Partial<Pick<GlobalSettings, 'agentCmdOverrides'>>

/** Reinstalls managed hooks after a settings update that changes where or whether they belong. */
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
    shouldContinue: (agent: AgentHookTarget) =>
      isAgentStatusHooksEnabledForAgent(store.getSettings(), agent)
  }
  const reconciliations: Promise<unknown>[] = []
  if (claudeProfilesChanged) {
    reconciliations.push(reconcileClaudeLaunchProfileHooks(before, settings, options))
  }
  if (hookSettingChanged) {
    reconciliations.push(
      applyAgentStatusHooksEnabled(settings.agentStatusHooksEnabled, settings, {
        ...options,
        // The profile reconciliation above already reinstalls Claude.
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
