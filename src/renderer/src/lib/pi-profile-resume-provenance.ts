import type { SleepingAgentLaunchConfig } from '../../../shared/agent-session-resume'
import {
  buildPiLaunchProfileEnv,
  findPiLaunchProfilesForTranscript,
  getDefaultPiAgentDirectory,
  isDefaultPiTranscriptPath,
  normalizePiAccountPath,
  normalizePiLaunchProfiles,
  piTranscriptBelongsToAgentDirectory,
  type PiLaunchProfile
} from '../../../shared/pi-launch-profiles'

export class PiResumeProfileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PiResumeProfileError'
  }
}

function capturedPiAgentDirectory(config: SleepingAgentLaunchConfig | undefined): string | null {
  const sourceDirectory = config?.agentEnv.ORCA_PI_SOURCE_AGENT_DIR?.trim() ?? ''
  const runtimeDirectory = config?.agentEnv.PI_CODING_AGENT_DIR?.trim() ?? ''
  const normalizedSourceDirectory = sourceDirectory ? normalizePiAccountPath(sourceDirectory) : ''
  const normalizedRuntimeDirectory = runtimeDirectory
    ? normalizePiAccountPath(runtimeDirectory)
    : ''

  if (
    (sourceDirectory && !normalizedSourceDirectory) ||
    (runtimeDirectory && !normalizedRuntimeDirectory)
  ) {
    throw new PiResumeProfileError('The captured Pi account directory is invalid.')
  }
  if (
    normalizedSourceDirectory &&
    normalizedRuntimeDirectory &&
    normalizedSourceDirectory !== normalizedRuntimeDirectory
  ) {
    throw new PiResumeProfileError('The captured Pi account directories disagree.')
  }
  return sourceDirectory || runtimeDirectory || null
}

export function getLocalDefaultPiAgentDirectory(): string | undefined {
  try {
    return getDefaultPiAgentDirectory(window.api.platform.get().homeDirectory)
  } catch {
    return undefined
  }
}

export function getPiAccountEnvironment(config: SleepingAgentLaunchConfig): Record<string, string> {
  const environment: Record<string, string> = {}
  if (config.agentEnv.PI_CODING_AGENT_DIR) {
    environment.PI_CODING_AGENT_DIR = config.agentEnv.PI_CODING_AGENT_DIR
  }
  if (config.agentEnv.ORCA_PI_SOURCE_AGENT_DIR) {
    environment.ORCA_PI_SOURCE_AGENT_DIR = config.agentEnv.ORCA_PI_SOURCE_AGENT_DIR
  }
  return environment
}

export function resolvePiHistoryLaunchConfig(args: {
  transcriptPath?: string
  commandOverride?: string | null
  agentArgs: string
  agentEnv: Record<string, string>
  profiles: unknown
  allowProfileSelection: boolean
  defaultAgentDirectory?: string
}): SleepingAgentLaunchConfig {
  return resolvePiResumeLaunchConfig({
    transcriptPath: args.transcriptPath,
    launchConfig: {
      ...(args.commandOverride?.trim() ? { agentCommand: args.commandOverride.trim() } : {}),
      agentArgs: args.agentArgs,
      agentEnv: args.agentEnv
    },
    profiles: args.profiles,
    allowProfileSelection: args.allowProfileSelection,
    defaultAgentDirectory: args.defaultAgentDirectory,
    allowCapturedSnapshot: false
  })
}

export function resolvePiResumeLaunchConfig(args: {
  transcriptPath?: string
  launchConfig: SleepingAgentLaunchConfig
  profiles: unknown
  allowProfileSelection?: boolean
  defaultAgentDirectory?: string
  allowCapturedSnapshot?: boolean
}): SleepingAgentLaunchConfig {
  const transcriptPath = args.transcriptPath?.trim()
  const capturedDirectory = capturedPiAgentDirectory(args.launchConfig)
  const hasCapturedCommand = Boolean(args.launchConfig.agentCommand?.trim())
  const allowProfileSelection = args.allowProfileSelection !== false
  const allowCapturedSnapshot = args.allowCapturedSnapshot !== false

  if (!transcriptPath) {
    if (capturedDirectory || (Array.isArray(args.profiles) && args.profiles.length > 0)) {
      throw new PiResumeProfileError(
        'This Pi session has no transcript path, so Orca cannot determine its account safely.'
      )
    }
    return args.launchConfig
  }

  if (
    allowCapturedSnapshot &&
    capturedDirectory &&
    hasCapturedCommand &&
    piTranscriptBelongsToAgentDirectory(transcriptPath, capturedDirectory)
  ) {
    return args.launchConfig
  }

  if (!allowProfileSelection) {
    if (
      !capturedDirectory &&
      isDefaultPiTranscriptPath(transcriptPath, args.defaultAgentDirectory)
    ) {
      return args.launchConfig
    }
    throw new PiResumeProfileError(
      "This Pi session's origin host was never recorded, so Orca refused to select a current local profile for it."
    )
  }

  const profiles = normalizePiLaunchProfiles(args.profiles)
  const rawProfileCount = Array.isArray(args.profiles) ? args.profiles.length : 0
  if (rawProfileCount !== profiles.length) {
    throw new PiResumeProfileError(
      'Pi profile settings are malformed. Fix or remove the invalid profile before resuming.'
    )
  }

  const matches = findPiLaunchProfilesForTranscript(profiles, transcriptPath)
  if (matches.length > 1) {
    throw new PiResumeProfileError(
      'This Pi session matches more than one configured profile. Make the account directories distinct before resuming.'
    )
  }
  if (matches.length === 1) {
    return applyPiProfileToLaunchConfig(args.launchConfig, matches[0])
  }

  if (capturedDirectory) {
    throw new PiResumeProfileError(
      hasCapturedCommand
        ? 'The captured Pi account does not own this transcript, and no configured profile matches it.'
        : 'The captured Pi account snapshot has no concrete command, and no configured profile matches it.'
    )
  }
  if (isDefaultPiTranscriptPath(transcriptPath, args.defaultAgentDirectory)) {
    return args.launchConfig
  }
  throw new PiResumeProfileError(
    rawProfileCount > 0
      ? 'No configured Pi profile owns this transcript. Orca refused to resume it with the default account.'
      : 'This Pi transcript is not in the conventional default account directory, so Orca cannot determine its account safely.'
  )
}

function applyPiProfileToLaunchConfig(
  config: SleepingAgentLaunchConfig,
  profile: PiLaunchProfile
): SleepingAgentLaunchConfig {
  return {
    agentCommand: profile.command,
    agentArgs: config.agentArgs,
    agentEnv: { ...config.agentEnv, ...buildPiLaunchProfileEnv(profile) },
    ...(config.ompResumeFilePath ? { ompResumeFilePath: config.ompResumeFilePath } : {})
  }
}
