import { lstatSync, mkdirSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export type OrcaLabPaths = {
  userData: string
  sessionData: string
}

type OrcaLabPathOptions = {
  root: string
  ordinaryUserData: string
  platform: NodeJS.Platform
}

export function areEquivalentPaths(
  left: string,
  right: string,
  platform: NodeJS.Platform = process.platform
): boolean {
  const normalizedLeft = resolve(left)
  const normalizedRight = resolve(right)
  return platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight
}

function normalizeForComparison(path: string, platform: NodeJS.Platform): string {
  const normalizedPath = resolve(path)
  return platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath
}

function pathsOverlap(left: string, right: string, platform: NodeJS.Platform): boolean {
  const normalizedLeft = normalizeForComparison(left, platform)
  const normalizedRight = normalizeForComparison(right, platform)
  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.startsWith(`${normalizedRight}${sep}`) ||
    normalizedRight.startsWith(`${normalizedLeft}${sep}`)
  )
}

function findNearestExistingAncestor(directory: string): string {
  let existingDirectory = resolve(directory)
  while (true) {
    try {
      lstatSync(existingDirectory)
      return existingDirectory
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') {
        throw error
      }
    }
    const parentDirectory = dirname(existingDirectory)
    if (parentDirectory === existingDirectory) {
      throw new Error('Orca Lab requires an accessible filesystem root')
    }
    existingDirectory = parentDirectory
  }
}

function canonicalizeFromExistingAncestor(directory: string): string {
  const resolvedDirectory = resolve(directory)
  const existingDirectory = findNearestExistingAncestor(resolvedDirectory)
  return resolve(
    realpathSync.native(existingDirectory),
    relative(existingDirectory, resolvedDirectory)
  )
}

function rejectSymlinkAncestor(directory: string, platform: NodeJS.Platform): void {
  const existingDirectory = findNearestExistingAncestor(directory)
  if (!areEquivalentPaths(realpathSync.native(existingDirectory), existingDirectory, platform)) {
    throw new Error('Orca Lab does not allow a symlink ORCA_LAB_ROOT or nested isolation path')
  }
}

export function prepareOrcaLabPaths(options: OrcaLabPathOptions): OrcaLabPaths {
  if (!options.root || !isAbsolute(options.root)) {
    throw new Error('Orca Lab requires an absolute ORCA_LAB_ROOT')
  }

  const root = resolve(options.root)
  const userData = join(root, 'profile')
  const sessionData = userData

  const canonicalOrdinaryUserData = canonicalizeFromExistingAncestor(options.ordinaryUserData)
  if (pathsOverlap(userData, canonicalOrdinaryUserData, options.platform)) {
    throw new Error('Orca Lab profile must not collide with the ordinary Orca profile tree')
  }

  const directories = [root, userData]
  for (const directory of directories) {
    rejectSymlinkAncestor(directory, options.platform)
  }
  for (const directory of directories) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
  }

  return { userData, sessionData }
}
