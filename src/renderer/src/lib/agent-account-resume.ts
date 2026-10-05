import { translate } from '../i18n/i18n'
import type { SleepingAgentLaunchConfig } from '../../../shared/agent-session-resume'
import {
  findAgentLaunchProfilesForTranscript,
  normalizeAgentLaunchProfiles,
  normalizeAgentAccountPath,
  transcriptBelongsToAgentSubdirectory,
  scopeAgentLaunchProfilesToHost,
  type AgentLaunchProfile,
  type AgentProfileHostScope
} from '../../../shared/agent-launch-profiles'
import {
  AGENT_LAUNCH_PROFILE_AGENTS,
  getRawAgentLaunchProfiles,
  isProfileAgent
} from '../../../shared/agent-launch-profile-agents'
import { getDefaultPiAgentDirectory } from '../../../shared/pi-launch-profiles'
import { getDefaultClaudeConfigDirectory } from '../../../shared/claude-launch-profiles'
import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '../../../shared/tui-agent-launch-defaults'
import type { TuiAgent } from '../../../shared/tui-agent'
import {
  resolveAgentProfileHostScope,
  type AgentProfileHostScopeState
} from './agent-profile-launch-target'
import { PiResumeProfileError, resolvePiResumeLaunchConfig } from './pi-profile-resume-provenance'

export type AgentAccountResumeResolution =
  | { ok: true; launchConfig: SleepingAgentLaunchConfig | undefined }
  | { ok: false; message: string }

export class AgentAccountResumeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgentAccountResumeError'
  }
}

const ACCOUNT_ENVIRONMENT_NAMES = [
  'PI_CODING_AGENT_DIR',
  'ORCA_PI_SOURCE_AGENT_DIR',
  'CLAUDE_CONFIG_DIR'
] as const

/** The account-selecting variables of a launch, for commands that run outside Orca's spawn env. */
export function getAgentAccountEnvironment(
  config: SleepingAgentLaunchConfig
): Record<string, string> {
  const environment: Record<string, string> = {}
  for (const name of ACCOUNT_ENVIRONMENT_NAMES) {
    const value = config.agentEnv[name]
    if (value) {
      environment[name] = value
    }
  }
  return environment
}

/**
 * Picks the account a resumed Pi or Claude session must run under. The transcript's location on
 * the host that owns the workspace decides; SSH hosts resolve `~/` profile roots against the home
 * they reported themselves. Hosts without remote profile roots keep the captured launch.
 */
export function resolveAgentAccountResumeLaunchConfig(args: {
  state: AgentProfileHostScopeState
  agent: TuiAgent
  worktreeId: string | undefined
  hostOptions?: Parameters<typeof resolveAgentProfileHostScope>[2]
  transcriptPath: string | undefined
  capturedLaunchConfig: SleepingAgentLaunchConfig | undefined
  originConnectionId: string | null | undefined
}): AgentAccountResumeResolution {
  const { state, agent, capturedLaunchConfig } = args
  const keepCaptured: AgentAccountResumeResolution = {
    ok: true,
    launchConfig: capturedLaunchConfig
  }
  if (!isProfileAgent(agent)) {
    return keepCaptured
  }
  const agentLabel = AGENT_LAUNCH_PROFILE_AGENTS[agent].label
  const rawProfiles = getRawAgentLaunchProfiles(state.settings, agent)
  const profiles = normalizeAgentLaunchProfiles(rawProfiles)
  const scopeResolution = args.worktreeId
    ? resolveAgentProfileHostScope(state, args.worktreeId, args.hostOptions)
    : ({ status: 'owner-unresolved' } as const)

  if (scopeResolution.status === 'owner-unresolved') {
    // Why: Pi always required a known owner; Claude only once profiles make the owner decisive.
    return agent === 'pi' || profiles.length > 0
      ? {
          ok: false,
          message: translate(
            'settings.agentLaunchProfiles.resumeOwnerUnavailable',
            'Cannot resume {{agentLabel}} until its workspace owner is available.',
            { agentLabel }
          )
        }
      : keepCaptured
  }
  if (scopeResolution.status === 'unsupported') {
    return keepCaptured
  }
  const hasRemoteProfiles = profiles.some((profile) => profile.remoteAgentDirectory)
  if (scopeResolution.status === 'remote-home-unknown') {
    return hasRemoteProfiles
      ? {
          ok: false,
          message: translate(
            'settings.agentLaunchProfiles.resumeRemoteHomeUnknown',
            'Cannot resume {{agentLabel}} until the SSH host reports its home directory. Reconnect and try again.',
            { agentLabel }
          )
        }
      : keepCaptured
  }
  const { scope, profileOriginConnectionId } = scopeResolution
  if (scope.kind === 'remote' && !hasRemoteProfiles) {
    return keepCaptured
  }
  const fallbackLaunchConfig: SleepingAgentLaunchConfig = capturedLaunchConfig ?? {
    agentArgs: resolveTuiAgentLaunchArgs(agent, state.settings?.agentDefaultArgs),
    agentEnv: resolveTuiAgentLaunchEnv(agent, state.settings?.agentDefaultEnv)
  }
  // Why: a session id names a transcript only on the host that captured it.
  const allowProfileSelection = args.originConnectionId === profileOriginConnectionId

  if (agent === 'pi') {
    try {
      return {
        ok: true,
        launchConfig: resolvePiResumeLaunchConfig({
          transcriptPath: args.transcriptPath,
          launchConfig: fallbackLaunchConfig,
          // Why: local resolution keeps the raw list so malformed settings refuse instead of vanishing.
          profiles:
            scope.kind === 'local' ? rawProfiles : scopeAgentLaunchProfilesToHost(profiles, scope),
          allowProfileSelection,
          defaultAgentDirectory: getDefaultPiAgentDirectory(scope.homeDirectory)
        })
      }
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof PiResumeProfileError
            ? error.message
            : translate(
                'settings.agentLaunchProfiles.resumePiAccountUnknown',
                'This Pi session cannot be associated with an account safely.'
              )
      }
    }
  }
  return resolveClaudeAccountResumeLaunchConfig({
    profiles,
    scope,
    transcriptPath: args.transcriptPath,
    allowProfileSelection,
    capturedLaunchConfig,
    fallbackLaunchConfig
  })
}

function resolveClaudeAccountResumeLaunchConfig(args: {
  profiles: readonly AgentLaunchProfile[]
  scope: AgentProfileHostScope
  transcriptPath: string | undefined
  allowProfileSelection: boolean
  capturedLaunchConfig: SleepingAgentLaunchConfig | undefined
  fallbackLaunchConfig: SleepingAgentLaunchConfig
}): AgentAccountResumeResolution {
  const transcriptPath = args.transcriptPath?.trim()
  if (!transcriptPath || !args.allowProfileSelection) {
    return { ok: true, launchConfig: args.capturedLaunchConfig }
  }
  const matches = findAgentLaunchProfilesForTranscript(
    scopeAgentLaunchProfilesToHost(args.profiles, args.scope),
    transcriptPath
  )
  if (matches.length > 1) {
    return {
      ok: false,
      message: translate(
        'settings.agentLaunchProfiles.resumeClaudeProfileAmbiguous',
        'This Claude session matches more than one configured profile. Make the account directories distinct before resuming.'
      )
    }
  }
  const [profile] = matches
  const defaultDirectory = getDefaultClaudeConfigDirectory(args.scope.homeDirectory)
  const accountDirectory =
    profile?.agentDirectory ??
    (transcriptBelongsToAgentSubdirectory(transcriptPath, defaultDirectory, 'projects')
      ? defaultDirectory
      : undefined)
  if (!accountDirectory) {
    return { ok: true, launchConfig: args.capturedLaunchConfig }
  }
  const capturedDirectory = args.capturedLaunchConfig?.agentEnv.CLAUDE_CONFIG_DIR
  if (
    capturedDirectory &&
    normalizeAgentAccountPath(capturedDirectory) === normalizeAgentAccountPath(accountDirectory) &&
    args.capturedLaunchConfig?.agentCommand?.trim()
  ) {
    return { ok: true, launchConfig: args.capturedLaunchConfig }
  }
  const agentEnv = { ...args.fallbackLaunchConfig.agentEnv }
  if (profile) {
    agentEnv.CLAUDE_CONFIG_DIR = profile.agentDirectory
  } else {
    // Why: pinning even ~/.claude changes the default OAuth Keychain identity.
    delete agentEnv.CLAUDE_CONFIG_DIR
  }
  return {
    ok: true,
    launchConfig: {
      agentCommand: profile?.command ?? 'claude',
      agentArgs: args.fallbackLaunchConfig.agentArgs,
      agentEnv
    }
  }
}
