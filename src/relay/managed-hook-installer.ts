import { join } from 'node:path'
import {
  AGENT_HOOK_INSTALL_MANAGED_HOOKS_METHOD,
  type AgentHookInstallManagedHooksParams
} from '../shared/agent-hook-relay'
import type { RelayDispatcher, RequestContext } from './dispatcher'
import type { AgentHookTarget } from '../shared/agent-hook-types'
import { isManagedAgentHookTarget } from '../shared/managed-agent-hook-targets'
import { normalizeRemoteAgentDirectory } from '../shared/agent-launch-profiles'
import { parseClaudeCliVersion } from '../main/claude/claude-hook-event-versions'

export type ManagedHookInstallSummary = {
  installers: number
  errors: number
}

export type ManagedHookRuntime = {
  installManagedHooks: (options?: {
    signal?: AbortSignal
    hostKeyFingerprint?: string
    agents?: readonly AgentHookTarget[]
    claudeVersion?: string
    claudeConfigDirectories?: readonly string[]
  }) => Promise<ManagedHookInstallSummary>
}

const SHA256_HOST_KEY_PATTERN = /^SHA256:[A-Za-z\d+/]{43}$/

function readHostKeyFingerprint(params: unknown): string | undefined {
  const fingerprint = (params as Partial<AgentHookInstallManagedHooksParams> | null)
    ?.hostKeyFingerprint
  return typeof fingerprint === 'string' && SHA256_HOST_KEY_PATTERN.test(fingerprint)
    ? fingerprint
    : undefined
}

function readAgents(params: unknown): AgentHookTarget[] {
  const raw = (params as Partial<AgentHookInstallManagedHooksParams> | null)?.agents
  if (raw === undefined) {
    return []
  }
  if (!Array.isArray(raw) || !raw.every(isManagedAgentHookTarget)) {
    throw new Error('invalid_managed_hook_agents')
  }
  return [...new Set(raw)]
}

function readClaudeVersion(params: unknown): string | undefined {
  const raw =
    params !== null && typeof params === 'object' && 'claudeVersion' in params
      ? params.claudeVersion
      : null
  return parseClaudeCliVersion(typeof raw === 'string' ? raw : null) ?? undefined
}

const DEFAULT_CLAUDE_CONFIG_DIRECTORY = '~/.claude'

function readClaudeConfigDirectories(params: unknown): string[] {
  const raw =
    params !== null && typeof params === 'object' && 'claudeConfigDirectories' in params
      ? params.claudeConfigDirectories
      : undefined
  if (raw === undefined) {
    return []
  }
  if (!Array.isArray(raw)) {
    throw new Error('invalid_claude_config_directories')
  }
  const directories = raw.map((value: unknown) =>
    typeof value === 'string' ? normalizeRemoteAgentDirectory(value) : null
  )
  if (!directories.every((directory): directory is string => directory !== null)) {
    throw new Error('invalid_claude_config_directories')
  }
  return [...new Set(directories)].filter(
    (directory) => directory !== DEFAULT_CLAUDE_CONFIG_DIRECTORY
  )
}

let managedHookRuntime: ManagedHookRuntime | null = null

function loadManagedHookRuntime(): ManagedHookRuntime {
  if (!managedHookRuntime) {
    // Why: keep the sizeable installer implementation out of relay startup and
    // its narrow TS project while still executing it in-process on the remote.
    managedHookRuntime = require(join(__dirname, 'managed-hook-runtime.js')) as ManagedHookRuntime
  }
  return managedHookRuntime
}

export function registerManagedHookInstaller(
  dispatcher: Pick<RelayDispatcher, 'onRequest'>,
  loadRuntime: () => ManagedHookRuntime = loadManagedHookRuntime
): void {
  dispatcher.onRequest(
    AGENT_HOOK_INSTALL_MANAGED_HOOKS_METHOD,
    async (params, context: RequestContext): Promise<ManagedHookInstallSummary> => {
      context.signal?.throwIfAborted()
      const hostKeyFingerprint = readHostKeyFingerprint(params)
      const agents = readAgents(params)
      const claudeVersion = readClaudeVersion(params)
      const claudeConfigDirectories = readClaudeConfigDirectories(params)
      return await loadRuntime().installManagedHooks({
        signal: context.signal,
        ...(hostKeyFingerprint ? { hostKeyFingerprint } : {}),
        agents,
        ...(claudeVersion ? { claudeVersion } : {}),
        ...(claudeConfigDirectories.length > 0 ? { claudeConfigDirectories } : {})
      })
    }
  )
}
