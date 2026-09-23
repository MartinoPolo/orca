import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { prepareOrcaLabPaths } from './orca-lab-isolation'

const temporaryRoots: string[] = []

function createTemporaryRoot(prefix = 'orca-lab-isolation-'): string {
  const root = mkdtempSync(join(tmpdir(), prefix))
  temporaryRoots.push(root)
  return root
}

function preparePaths(root: string, ordinaryUserData = join(tmpdir(), 'ordinary-orca-profile')) {
  return prepareOrcaLabPaths({
    root,
    ordinaryUserData,
    platform: process.platform
  })
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('prepareOrcaLabPaths', () => {
  it('rejects a missing or relative lab root before writing', () => {
    const relativeRoot = `relative-orca-lab-${Date.now()}`

    expect(() => preparePaths('')).toThrow(/absolute ORCA_LAB_ROOT/)
    expect(() => preparePaths(relativeRoot)).toThrow(/absolute ORCA_LAB_ROOT/)
    expect(existsSync(resolve(relativeRoot))).toBe(false)
  })

  it('rejects collision with the ordinary Orca profile tree before writing', () => {
    const root = createTemporaryRoot()
    const intendedLabProfile = join(root, 'profile')

    expect(() => preparePaths(root, intendedLabProfile)).toThrow(/ordinary Orca profile/)
    expect(readdirSync(root)).toEqual([])
  })

  it('rejects an ordinary profile junction into the Lab profile before writing', () => {
    const root = createTemporaryRoot()
    const labProfile = join(root, 'profile')
    mkdirSync(labProfile)
    const ordinaryRoot = createTemporaryRoot()
    const ordinaryProfile = join(ordinaryRoot, 'profile')
    symlinkSync(labProfile, ordinaryProfile, process.platform === 'win32' ? 'junction' : 'dir')

    expect(() => preparePaths(root, ordinaryProfile)).toThrow(/ordinary Orca profile/)
    expect(readdirSync(labProfile)).toEqual([])
  })

  it('rejects an ordinary profile whose existing ancestor redirects to the Lab root', () => {
    const root = createTemporaryRoot()
    const ordinaryRoot = createTemporaryRoot()
    const labRootAlias = join(ordinaryRoot, 'lab-root')
    symlinkSync(root, labRootAlias, process.platform === 'win32' ? 'junction' : 'dir')

    expect(() => preparePaths(root, join(labRootAlias, 'profile'))).toThrow(/ordinary Orca profile/)
    expect(readdirSync(root)).toEqual([])
  })

  it('rejects a dangling ordinary profile alias before activating it', () => {
    const root = createTemporaryRoot()
    const ordinaryRoot = createTemporaryRoot()
    const ordinaryProfile = join(ordinaryRoot, 'profile')
    symlinkSync(
      join(root, 'profile'),
      ordinaryProfile,
      process.platform === 'win32' ? 'junction' : 'dir'
    )

    expect(() => preparePaths(root, ordinaryProfile)).toThrow()
    expect(readdirSync(root)).toEqual([])
    expect(existsSync(ordinaryProfile)).toBe(false)
  })

  it('rejects a symlink lab root', () => {
    const target = createTemporaryRoot()
    const link = `${target}-link`
    temporaryRoots.push(link)
    symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir')

    expect(() => preparePaths(link)).toThrow(/symlink ORCA_LAB_ROOT/)
  })

  it('rejects a redirected profile before writing through it', () => {
    const root = createTemporaryRoot()
    const target = createTemporaryRoot()
    symlinkSync(target, join(root, 'profile'), process.platform === 'win32' ? 'junction' : 'dir')

    expect(() => preparePaths(root)).toThrow(/symlink/)
    expect(readdirSync(target)).toEqual([])
  })

  it('keeps session storage in the existing Lab profile without changing the home', () => {
    const root = createTemporaryRoot()

    const paths = preparePaths(root)

    expect(paths).toEqual({
      userData: join(root, 'profile'),
      sessionData: join(root, 'profile')
    })
    expect(paths.sessionData).toBe(paths.userData)
    expect(Object.values(paths).every((path) => existsSync(path))).toBe(true)
    expect(readdirSync(paths.userData)).toEqual([])
    expect(existsSync(join(root, 'home'))).toBe(false)
  })
})
