import type { AgentHookInstallStatus, AgentHookTarget } from '../../shared/agent-hook-types'
import {
  getManagedAgentHookTarget,
  isManagedAgentHookTarget
} from '../../shared/managed-agent-hook-targets'
import { normalizeDisabledTuiAgents } from '../../shared/tui-agent-selection'
import type { GlobalSettings } from '../../shared/global-settings-types'
import { normalizeAgentAccountPath } from '../../shared/agent-launch-profiles'
import {
  isAgentStatusHooksEnabled,
  isAgentStatusHooksEnabledForAgent
} from '../../shared/agent-status-hooks-setting'
import {
  getLocalClaudeConfigDirectories,
  removeClaudeProfileHooks
} from './local-claude-profile-hooks'
import { errorStatus, skippedStatus } from './managed-hook-control-status'
import { probeClaudeCliVersion } from '../claude/claude-hook-event-versions'
import { detectLocalManagedAgentCliPresence } from './local-agent-cli-presence'
import {
  MANAGED_AGENT_HOOK_ASYNC_REMOVERS,
  MANAGED_AGENT_HOOK_INSTALLERS,
  MANAGED_AGENT_HOOK_REMOVERS,
  MANAGED_AGENT_HOOK_SCRIPT_REFRESHERS,
  MANAGED_AGENT_HOOK_STATUS_READERS,
  type ManagedAgentHookInstaller,
  type ManagedAgentHookInstallOptions
} from './managed-agent-hook-registry'

export { MANAGED_AGENT_HOOK_INSTALLERS } from './managed-agent-hook-registry'
export {
  isAgentStatusHooksEnabled,
  isAgentStatusHooksEnabledForAgent
} from '../../shared/agent-status-hooks-setting'

type ManagedHookSettings = Partial<
  Pick<
    GlobalSettings,
    'agentCmdOverrides' | 'agentStatusHooksEnabled' | 'disabledTuiAgents' | 'claudeLaunchProfiles'
  >
> | null

type InstallOptions = {
  /** Set only for an explicit user action, never for startup reconciliation. */
  userInitiated?: boolean
  shouldHydrateShellPath?: boolean
  onInstallError?: (agent: AgentHookTarget, error: unknown) => void
  shouldContinue?: (agent: AgentHookTarget) => boolean
  agents?: readonly AgentHookTarget[]
}

type RemoveOptions = {
  agents?: readonly AgentHookTarget[]
  settings?: ManagedHookSettings
}

export type StartupManagedHookAction = 'install' | 'skip'

// Why never 'remove': this reads THIS instance's settings, but the managed hook files are
// user-global (~/.claude/settings.json, ~/.cursor/hooks.json). A second Orca profile with the off
// switch set would delete the hooks every other instance depends on, and Cursor — the one agent
// with no title-derived status fallback — then goes silently idle (STA-5679). Honoring the off
// switch only requires skipping the install; explicit removal stays on the Settings toggle.
export function resolveStartupManagedHookAction(
  settings: ManagedHookSettings
): StartupManagedHookAction {
  return isAgentStatusHooksEnabled(settings) ? 'install' : 'skip'
}

export function shouldInstallStartupManagedAgentHook(
  settings: ManagedHookSettings,
  agent: AgentHookTarget
): boolean {
  return isAgentStatusHooksEnabledForAgent(settings, agent)
}

export function shouldContinueManagedHookStartup(
  isQuitting: boolean,
  settings: ManagedHookSettings,
  agent: AgentHookTarget
): boolean {
  return !isQuitting && isAgentStatusHooksEnabledForAgent(settings, agent)
}

function selectedInstallers(options: InstallOptions): readonly ManagedAgentHookInstaller[] {
  if (!options.agents) {
    return MANAGED_AGENT_HOOK_INSTALLERS
  }
  const allowed = new Set(options.agents)
  return MANAGED_AGENT_HOOK_INSTALLERS.filter(([agent]) => allowed.has(agent))
}

async function runInstaller(
  entry: ManagedAgentHookInstaller,
  onInstallError: InstallOptions['onInstallError'],
  options: ManagedAgentHookInstallOptions
): Promise<AgentHookInstallStatus> {
  const [agent, install] = entry
  try {
    return await install(options)
  } catch (error) {
    console.error(`[agent-hooks] Failed to install ${agent} managed hooks:`, error)
    try {
      onInstallError?.(agent, error)
    } catch (telemetryError) {
      console.error('[agent-hooks] Failed to record install-failure telemetry:', telemetryError)
    }
    return errorStatus(agent, error)
  }
}

// Why (#11549 aftermath): a CLI that falls off PATH keeps its user-wide config invoking
// Orca's script, but the presence gate below then skips install() forever, freezing the
// script at whatever Orca generated last. Existing scripts are Orca-owned, so bring them
// current before any gating; creating new ones remains install()'s presence-gated job.
async function refreshExistingManagedScripts(options: InstallOptions): Promise<void> {
  const allowed = options.agents ? new Set(options.agents) : null
  for (const [agent, refresh] of MANAGED_AGENT_HOOK_SCRIPT_REFRESHERS) {
    if (allowed !== null && !allowed.has(agent)) {
      continue
    }
    try {
      await refresh()
    } catch (error) {
      console.error(`[agent-hooks] Failed to refresh ${agent} managed script:`, error)
    }
  }
}

export async function installManagedAgentHooks(
  settings: ManagedHookSettings = null,
  options: InstallOptions = {}
): Promise<AgentHookInstallStatus[]> {
  await refreshExistingManagedScripts(options)
  const installers = selectedInstallers(options)
  if (!isAgentStatusHooksEnabled(settings)) {
    return installers.map(([agent]) =>
      skippedStatus(agent, 'hooks_disabled', 'Agent status hooks are disabled in Settings.')
    )
  }
  const disabled = new Set(normalizeDisabledTuiAgents(settings?.disabledTuiAgents))
  const enabledInstallers = installers.filter(([agent]) => !disabled.has(agent))
  const targets = enabledInstallers.flatMap(([agent]) => {
    const target = getManagedAgentHookTarget(agent)
    return target ? [target] : []
  })
  let presenceByAgent
  try {
    presenceByAgent = await detectLocalManagedAgentCliPresence(targets, settings, {
      shouldHydrateShellPath: options.shouldHydrateShellPath
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return installers.map(([agent]) =>
      disabled.has(agent)
        ? skippedStatus(agent, 'agent_disabled', 'Agent is disabled in Settings.')
        : skippedStatus(agent, 'cli_presence_unknown', detail)
    )
  }

  const results: AgentHookInstallStatus[] = []
  for (const entry of installers) {
    const [agent] = entry
    if (disabled.has(agent)) {
      results.push(skippedStatus(agent, 'agent_disabled', 'Agent is disabled in Settings.'))
      continue
    }
    if (options.shouldContinue && !options.shouldContinue(agent)) {
      results.push(
        skippedStatus(
          agent,
          'hooks_disabled',
          'Agent status hooks were disabled before install completed.'
        )
      )
      continue
    }
    const presence = presenceByAgent[agent]
    if (presence?.state !== 'found') {
      results.push(
        skippedStatus(
          agent,
          presence?.state === 'unknown' ? 'cli_presence_unknown' : 'cli_not_found',
          'CLI not found; managed hook install skipped.'
        )
      )
      continue
    }
    const cliVersion =
      agent === 'claude' && presence.executablePath
        ? await probeClaudeCliVersion(presence.executablePath)
        : null
    if (options.shouldContinue && !options.shouldContinue(agent)) {
      results.push(
        skippedStatus(
          agent,
          'hooks_disabled',
          'Agent status hooks were disabled before install completed.'
        )
      )
      continue
    }
    const installOptions = {
      ...(options.userInitiated !== undefined ? { userInitiated: options.userInitiated } : {}),
      ...(cliVersion ? { cliVersion } : {})
    }
    results.push(await runInstaller(entry, options.onInstallError, installOptions))
    if (agent === 'claude') {
      for (const configDirectory of getLocalClaudeConfigDirectories(settings)) {
        if (options.shouldContinue && !options.shouldContinue(agent)) {
          break
        }
        results.push(
          await runInstaller(entry, options.onInstallError, { ...installOptions, configDirectory })
        )
      }
    }
  }
  return results
}

export async function removeManagedAgentHooks(
  options: RemoveOptions = {}
): Promise<AgentHookInstallStatus[]> {
  const allowed = options.agents ? new Set(options.agents) : null
  const results: AgentHookInstallStatus[] = []
  for (const [agent, remove] of MANAGED_AGENT_HOOK_REMOVERS) {
    if (allowed !== null && !allowed.has(agent)) {
      continue
    }
    try {
      results.push(await remove())
    } catch (error) {
      results.push(errorStatus(agent, error))
    }
  }
  if (allowed === null || allowed.has('claude')) {
    results.push(
      ...(await removeClaudeProfileHooks(getLocalClaudeConfigDirectories(options.settings ?? null)))
    )
  }
  return results
}

export async function reconcileClaudeLaunchProfileHooks(
  previousSettings: ManagedHookSettings,
  settings: ManagedHookSettings,
  options: InstallOptions = {}
): Promise<AgentHookInstallStatus[]> {
  const currentDirectories = new Set(
    getLocalClaudeConfigDirectories(settings).map(normalizeAgentAccountPath)
  )
  const retiredDirectories = getLocalClaudeConfigDirectories(previousSettings).filter(
    (directory) => !currentDirectories.has(normalizeAgentAccountPath(directory))
  )
  const removed = await removeClaudeProfileHooks(retiredDirectories)
  const reconciled = await applyAgentStatusHooksEnabled(
    isAgentStatusHooksEnabled(settings),
    settings,
    {
      ...options,
      agents: ['claude']
    }
  )
  return [...removed, ...reconciled]
}

export async function removeManagedAgentHooksAsync(
  options: RemoveOptions = {}
): Promise<AgentHookInstallStatus[]> {
  const allowed = options.agents ? new Set(options.agents) : null
  return await Promise.all(
    MANAGED_AGENT_HOOK_ASYNC_REMOVERS.filter(
      ([agent]) => allowed === null || allowed.has(agent)
    ).map(async ([agent, remove]) => {
      try {
        return await remove()
      } catch (error) {
        return errorStatus(agent, error)
      }
    })
  )
}

export function getManagedAgentHookStatuses(): AgentHookInstallStatus[] {
  return MANAGED_AGENT_HOOK_STATUS_READERS.map(([agent, getStatus]) => {
    try {
      return getStatus()
    } catch (error) {
      return errorStatus(agent, error)
    }
  })
}

export async function applyAgentStatusHooksEnabled(
  enabled: boolean,
  settings: ManagedHookSettings = null,
  options: InstallOptions = {}
): Promise<AgentHookInstallStatus[]> {
  if (!enabled) {
    return await removeManagedAgentHooks({ agents: options.agents, settings })
  }
  const disabled = normalizeDisabledTuiAgents(settings?.disabledTuiAgents).filter(
    isManagedAgentHookTarget
  )
  const installed = await installManagedAgentHooks(settings, options)
  const disabledToRemove = options.shouldContinue
    ? disabled.filter((agent) => !options.shouldContinue?.(agent))
    : disabled
  if (disabledToRemove.length === 0) {
    return installed
  }
  const removed = new Map(
    (await removeManagedAgentHooks({ agents: disabledToRemove, settings })).map((status) => [
      status.agent,
      status
    ])
  )
  return installed.map((status) => removed.get(status.agent) ?? status)
}
