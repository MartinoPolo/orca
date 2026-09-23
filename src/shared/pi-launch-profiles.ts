export type PiLaunchProfile = {
  id: string
  name: string
  command: string
  agentDirectory: string
}

const PROFILE_ID_PATTERN = /^[A-Za-z0-9._-]+$/
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[A-Za-z]:[\\/]/
const WINDOWS_UNC_PATH_PATTERN = /^(?:\\\\|\/\/)[^\\/]+[\\/][^\\/]+/
const WINDOWS_EXTENDED_PATH_PATTERN = /^(?:\\\\|\/\/)[?.][\\/]/

type CanonicalPiAccountPath = {
  path: string
  windowsRules: boolean
}

function resolveLexicalSegments(segments: readonly string[]): string[] | null {
  const resolved: string[] = []
  for (const segment of segments) {
    if (!segment || segment === '.') {
      continue
    }
    if (segment === '..') {
      if (resolved.length === 0) {
        return null
      }
      resolved.pop()
      continue
    }
    resolved.push(segment)
  }
  return resolved
}

function canonicalizePiAccountPath(value: string): CanonicalPiAccountPath | null {
  const trimmed = value.trim()
  if (!trimmed || /[\0\r\n]/.test(trimmed) || WINDOWS_EXTENDED_PATH_PATTERN.test(trimmed)) {
    return null
  }
  if (WINDOWS_ABSOLUTE_PATH_PATTERN.test(trimmed)) {
    const slashPath = trimmed.replace(/\\/g, '/')
    const segments = resolveLexicalSegments(slashPath.slice(3).split('/'))
    if (!segments) {
      return null
    }
    return {
      path: `${slashPath.slice(0, 2)}/${segments.join('/')}`.replace(/\/$/, '').toLowerCase(),
      windowsRules: true
    }
  }
  if (WINDOWS_UNC_PATH_PATTERN.test(trimmed)) {
    const slashPath = trimmed.replace(/\\/g, '/')
    const [server, share, ...tail] = slashPath.slice(2).split('/')
    if (!server || !share || server === '.' || server === '..' || share === '.' || share === '..') {
      return null
    }
    const segments = resolveLexicalSegments(tail)
    if (!segments) {
      return null
    }
    return {
      path: `//${server}/${share}${segments.length > 0 ? `/${segments.join('/')}` : ''}`.toLowerCase(),
      windowsRules: true
    }
  }
  if (!trimmed.startsWith('/')) {
    return null
  }
  const segments = resolveLexicalSegments(trimmed.slice(1).split('/'))
  if (!segments) {
    return null
  }
  return { path: `/${segments.join('/')}`, windowsRules: false }
}

function isAbsoluteAgentDirectory(value: string): boolean {
  const canonical = canonicalizePiAccountPath(value)
  if (!canonical) {
    return false
  }
  return canonical.path !== '/' && !/^[a-z]:$/i.test(canonical.path)
}

export function normalizePiProfileName(value: string): string {
  return value.trim().normalize('NFKC').toLowerCase()
}

export function normalizePiLaunchProfile(value: unknown): PiLaunchProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const id = 'id' in value && typeof value.id === 'string' ? value.id.trim() : ''
  const name = 'name' in value && typeof value.name === 'string' ? value.name.trim() : ''
  const command =
    'command' in value && typeof value.command === 'string' ? value.command.trim() : ''
  const agentDirectory =
    'agentDirectory' in value && typeof value.agentDirectory === 'string'
      ? value.agentDirectory.trim()
      : ''
  if (
    !id ||
    id.length > 128 ||
    !PROFILE_ID_PATTERN.test(id) ||
    !name ||
    name.length > 128 ||
    !command ||
    command.length > 2048 ||
    !agentDirectory ||
    agentDirectory.length > 2048 ||
    !isAbsoluteAgentDirectory(agentDirectory) ||
    /[\0\r\n]/.test(command)
  ) {
    return null
  }
  return { id, name, command, agentDirectory }
}

export function normalizePiLaunchProfiles(value: unknown): PiLaunchProfile[] {
  if (!Array.isArray(value)) {
    return []
  }
  const profiles: PiLaunchProfile[] = []
  const seenIds = new Set<string>()
  const seenNames = new Set<string>()
  for (const raw of value) {
    const profile = normalizePiLaunchProfile(raw)
    const normalizedName = profile ? normalizePiProfileName(profile.name) : ''
    if (!profile || seenIds.has(profile.id) || seenNames.has(normalizedName)) {
      continue
    }
    seenIds.add(profile.id)
    seenNames.add(normalizedName)
    profiles.push(profile)
  }
  return profiles
}

export function normalizePiAccountPath(value: string): string {
  return canonicalizePiAccountPath(value)?.path ?? ''
}

export function piTranscriptBelongsToAgentDirectory(
  transcriptPath: string,
  agentDirectory: string
): boolean {
  const normalizedTranscript = normalizePiAccountPath(transcriptPath)
  const normalizedDirectory = normalizePiAccountPath(agentDirectory)
  if (!normalizedTranscript || !normalizedDirectory) {
    return false
  }
  return (
    normalizedTranscript === normalizedDirectory ||
    normalizedTranscript.startsWith(`${normalizedDirectory}/`)
  )
}

export function piAccountDirectoriesOverlap(left: string, right: string): boolean {
  const normalizedLeft = normalizePiAccountPath(left)
  const normalizedRight = normalizePiAccountPath(right)
  if (!normalizedLeft || !normalizedRight) {
    return false
  }
  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.startsWith(`${normalizedRight}/`) ||
    normalizedRight.startsWith(`${normalizedLeft}/`)
  )
}

export function findPiLaunchProfilesForTranscript(
  profiles: readonly PiLaunchProfile[],
  transcriptPath: string
): PiLaunchProfile[] {
  return profiles.filter((profile) =>
    piTranscriptBelongsToAgentDirectory(transcriptPath, profile.agentDirectory)
  )
}

export function buildPiLaunchProfileEnv(profile: PiLaunchProfile): Record<string, string> {
  return {
    PI_CODING_AGENT_DIR: profile.agentDirectory,
    ORCA_PI_SOURCE_AGENT_DIR: profile.agentDirectory
  }
}

export function getDefaultPiAgentDirectory(homeDirectory: string | undefined): string | undefined {
  if (!homeDirectory) {
    return undefined
  }
  const normalizedHome = normalizePiAccountPath(homeDirectory)
  if (!normalizedHome) {
    return undefined
  }
  return normalizedHome === '/' ? '/.pi/agent' : `${normalizedHome}/.pi/agent`
}

export function isDefaultPiTranscriptPath(
  transcriptPath: string,
  defaultAgentDirectory: string | undefined
): boolean {
  if (!defaultAgentDirectory) {
    return false
  }
  const sessionsDirectory = `${defaultAgentDirectory.replace(/[\\/]+$/, '')}/sessions`
  return piTranscriptBelongsToAgentDirectory(transcriptPath, sessionsDirectory)
}
