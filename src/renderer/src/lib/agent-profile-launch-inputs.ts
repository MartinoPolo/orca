import type { AppState } from '@/store/types'
import type { TuiAgent } from '../../../shared/tui-agent'
import {
  normalizeAgentLaunchProfile,
  scopeAgentLaunchProfilesToHost,
  type AgentLaunchProfile
} from '../../../shared/agent-launch-profiles'
import {
  buildAgentLaunchProfileEnv,
  isProfileAgent
} from '../../../shared/agent-launch-profile-agents'
import { resolveAgentProfileHostScope } from '@/lib/agent-profile-launch-target'

export type AgentProfileLaunchInputs =
  | { ok: false }
  | {
      ok: true
      commandOverrides: Partial<Record<TuiAgent, string>>
      environment: Record<string, string>
    }

/** Applies a named profile to a new launch; SSH hosts get the profile's root under their own home. */
export function resolveAgentProfileLaunchInputs(args: {
  agent: TuiAgent
  profile?: AgentLaunchProfile
  state: AppState
  worktreeId: string
  resolvedLaunchPlatform: NodeJS.Platform
  clientPlatform: NodeJS.Platform
  commandOverrides: Partial<Record<TuiAgent, string>>
  environment: Record<string, string>
}): AgentProfileLaunchInputs {
  if (!args.profile) {
    return {
      ok: true,
      commandOverrides: args.commandOverrides,
      environment: args.environment
    }
  }
  const profile = normalizeAgentLaunchProfile(args.profile)
  if (!isProfileAgent(args.agent) || !profile) {
    return { ok: false }
  }
  const hostScope = resolveAgentProfileHostScope(args.state, args.worktreeId, {
    platform: args.clientPlatform
  })
  if (hostScope.status !== 'resolved') {
    return { ok: false }
  }
  if (hostScope.scope.kind === 'local' && args.resolvedLaunchPlatform !== args.clientPlatform) {
    return { ok: false }
  }
  const [hostProfile] = scopeAgentLaunchProfilesToHost([profile], hostScope.scope)
  if (!hostProfile) {
    return { ok: false }
  }
  return {
    ok: true,
    commandOverrides: { ...args.commandOverrides, [args.agent]: hostProfile.command },
    environment: {
      ...args.environment,
      ...buildAgentLaunchProfileEnv(args.agent, hostProfile)
    }
  }
}
