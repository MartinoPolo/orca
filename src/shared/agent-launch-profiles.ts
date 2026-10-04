export type AgentLaunchProfile = {
  id: string
  name: string
  command: string
  agentDirectory: string
  /** `~/`-relative account directory on SSH hosts; profiles without one stay local-only. */
  remoteAgentDirectory?: string
}

/** Which machine's account directories a launch or resume resolves against. */
export type AgentProfileHostScope =
  | { kind: 'local'; homeDirectory: string | undefined }
  | { kind: 'remote'; homeDirectory: string }

const PROFILE_ID_PATTERN = /^[A-Za-z0-9._-]+$/
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[A-Za-z]:[\\/]/
const WINDOWS_UNC_PATH_PATTERN = /^(?:\\\\|\/\/)[^\\/]+[\\/][^\\/]+/
const WINDOWS_EXTENDED_PATH_PATTERN = /^(?:\\\\|\/\/)[?.][\\/]/

type CanonicalAccountPath = {
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

function canonicalizeAccountPath(value: string): CanonicalAccountPath | null {
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
  const canonical = canonicalizeAccountPath(value)
  if (!canonical) {
    return false
  }
  return canonical.path !== '/' && !/^[a-z]:$/i.test(canonical.path)
}

export function normalizeAgentProfileName(value: string): string {
  return value.trim().normalize('NFKC').toLowerCase()
}

export function normalizeAgentLaunchProfile(value: unknown): AgentLaunchProfile | null {
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
  const rawRemoteAgentDirectory =
    'remoteAgentDirectory' in value && typeof value.remoteAgentDirectory === 'string'
      ? value.remoteAgentDirectory.trim()
      : ''
  const remoteAgentDirectory = rawRemoteAgentDirectory
    ? normalizeRemoteAgentDirectory(rawRemoteAgentDirectory)
    : null
  if (rawRemoteAgentDirectory && !remoteAgentDirectory) {
    return null
  }
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
  return {
    id,
    name,
    command,
    agentDirectory,
    ...(remoteAgentDirectory ? { remoteAgentDirectory } : {})
  }
}

/** Accepts `~/dir`, `~\dir`, or `dir` and returns the canonical `~/dir` form. */
export function normalizeRemoteAgentDirectory(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 2048 || /[\0\r\n]/.test(trimmed)) {
    return null
  }
  const relative = trimmed.replace(/\\/g, '/').replace(/^~(?:\/|$)/, '')
  if (relative.startsWith('/') || /^[A-Za-z]:/.test(relative)) {
    return null
  }
  const segments = relative.split('/').filter((segment) => segment && segment !== '.')
  // Why: `~name` names another user's home; profile roots stay under the connected account's own.
  if (
    segments.length === 0 ||
    segments.some((segment) => segment === '..' || segment.startsWith('~'))
  ) {
    return null
  }
  return `~/${segments.join('/')}`
}

/** Resolves a `~/`-relative directory against the home the SSH host itself reported. */
export function resolveRemoteAgentDirectory(
  homeDirectory: string,
  remoteAgentDirectory: string
): string | null {
  const relative = normalizeRemoteAgentDirectory(remoteAgentDirectory)
  const home = homeDirectory.trim().replace(/[\\/]+$/, '')
  if (!relative || !home || !isAbsoluteAgentDirectory(home)) {
    return null
  }
  const separator = WINDOWS_ABSOLUTE_PATH_PATTERN.test(home) ? '\\' : '/'
  return `${home}${separator}${relative.slice(2).split('/').join(separator)}`
}

export function remoteAgentDirectoriesOverlap(left: string, right: string): boolean {
  const placeholderHome = '/remote-home'
  const resolvedLeft = resolveRemoteAgentDirectory(placeholderHome, left)
  const resolvedRight = resolveRemoteAgentDirectory(placeholderHome, right)
  return Boolean(
    resolvedLeft && resolvedRight && agentAccountDirectoriesOverlap(resolvedLeft, resolvedRight)
  )
}

/** Profiles usable on a host, with `agentDirectory` rewritten to that host's absolute root. */
export function scopeAgentLaunchProfilesToHost(
  profiles: readonly AgentLaunchProfile[],
  scope: AgentProfileHostScope
): AgentLaunchProfile[] {
  if (scope.kind === 'local') {
    return [...profiles]
  }
  return profiles.flatMap((profile) => {
    const agentDirectory = profile.remoteAgentDirectory
      ? resolveRemoteAgentDirectory(scope.homeDirectory, profile.remoteAgentDirectory)
      : null
    return agentDirectory ? [{ ...profile, agentDirectory }] : []
  })
}

export function getDefaultAgentDirectory(
  homeDirectory: string | undefined,
  homeRelativeDirectory: string
): string | undefined {
  if (!homeDirectory) {
    return undefined
  }
  const normalizedHome = normalizeAgentAccountPath(homeDirectory)
  if (!normalizedHome) {
    return undefined
  }
  return normalizedHome === '/'
    ? `/${homeRelativeDirectory}`
    : `${normalizedHome}/${homeRelativeDirectory}`
}

export function transcriptBelongsToAgentSubdirectory(
  transcriptPath: string,
  agentDirectory: string | undefined,
  subdirectory: string
): boolean {
  if (!agentDirectory) {
    return false
  }
  return transcriptBelongsToAgentDirectory(
    transcriptPath,
    `${agentDirectory.replace(/[\\/]+$/, '')}/${subdirectory}`
  )
}

export function normalizeAgentLaunchProfiles(value: unknown): AgentLaunchProfile[] {
  if (!Array.isArray(value)) {
    return []
  }
  const profiles: AgentLaunchProfile[] = []
  const seenIds = new Set<string>()
  const seenNames = new Set<string>()
  for (const raw of value) {
    const profile = normalizeAgentLaunchProfile(raw)
    const normalizedName = profile ? normalizeAgentProfileName(profile.name) : ''
    if (!profile || seenIds.has(profile.id) || seenNames.has(normalizedName)) {
      continue
    }
    seenIds.add(profile.id)
    seenNames.add(normalizedName)
    profiles.push(profile)
  }
  return profiles
}

export function normalizeAgentAccountPath(value: string): string {
  return canonicalizeAccountPath(value)?.path ?? ''
}

export function transcriptBelongsToAgentDirectory(
  transcriptPath: string,
  agentDirectory: string
): boolean {
  const normalizedTranscript = normalizeAgentAccountPath(transcriptPath)
  const normalizedDirectory = normalizeAgentAccountPath(agentDirectory)
  if (!normalizedTranscript || !normalizedDirectory) {
    return false
  }
  return (
    normalizedTranscript === normalizedDirectory ||
    normalizedTranscript.startsWith(`${normalizedDirectory}/`)
  )
}

export function agentAccountDirectoriesOverlap(left: string, right: string): boolean {
  const normalizedLeft = normalizeAgentAccountPath(left)
  const normalizedRight = normalizeAgentAccountPath(right)
  if (!normalizedLeft || !normalizedRight) {
    return false
  }
  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.startsWith(`${normalizedRight}/`) ||
    normalizedRight.startsWith(`${normalizedLeft}/`)
  )
}

export function findAgentLaunchProfilesForTranscript(
  profiles: readonly AgentLaunchProfile[],
  transcriptPath: string
): AgentLaunchProfile[] {
  return profiles.filter((profile) =>
    transcriptBelongsToAgentDirectory(transcriptPath, profile.agentDirectory)
  )
}
