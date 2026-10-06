import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
// Why: loading the config caches its policy modules, whose exports the proof test swaps.
require('../electron-builder.config.cjs')

describe('electron-builder manual-update config', () => {
  it('marks manual-update packages without publishing while preserving version metadata', () => {
    const configPath = require.resolve('../electron-builder.config.cjs')
    const originalManualUpdatesOnly = process.env.ORCA_MANUAL_UPDATES_ONLY
    const originalLocalVersion = process.env.ORCA_LOCAL_BUILD_VERSION
    const originalBuildCommit = process.env.ORCA_BUILD_COMMIT
    try {
      delete require.cache[configPath]
      process.env.ORCA_MANUAL_UPDATES_ONLY = '1'
      process.env.ORCA_LOCAL_BUILD_VERSION = '1.4.159-local.20260924100739.gabcdef01'
      process.env.ORCA_BUILD_COMMIT = 'abcdef0123456789abcdef0123456789abcdef01'
      const config = require('../electron-builder.config.cjs')

      expect(config.extraMetadata).toEqual({
        version: '1.4.159-local.20260924100739.gabcdef01',
        orcaManualUpdatesOnly: true,
        orcaBuildSource: {
          repository: 'MartinoPolo/orca',
          branch: 'main',
          commit: process.env.ORCA_BUILD_COMMIT
        }
      })
      expect(config.publish).toBeNull()
      delete process.env.ORCA_BUILD_COMMIT
      expect(() => config.beforePack({ electronPlatformName: 'win32', arch: 1 })).toThrow(
        /requires ORCA_BUILD_COMMIT and MPX_APPS/
      )
    } finally {
      if (originalBuildCommit === undefined) {
        delete process.env.ORCA_BUILD_COMMIT
      } else {
        process.env.ORCA_BUILD_COMMIT = originalBuildCommit
      }
      if (originalManualUpdatesOnly === undefined) {
        delete process.env.ORCA_MANUAL_UPDATES_ONLY
      } else {
        process.env.ORCA_MANUAL_UPDATES_ONLY = originalManualUpdatesOnly
      }
      if (originalLocalVersion === undefined) {
        delete process.env.ORCA_LOCAL_BUILD_VERSION
      } else {
        process.env.ORCA_LOCAL_BUILD_VERSION = originalLocalVersion
      }
      delete require.cache[configPath]
      require('../electron-builder.config.cjs')
    }
  })

  it('requires matching compiled proof for manual packaging on any target platform', async () => {
    const configPath = require.resolve('../electron-builder.config.cjs')
    const sourcePolicyPath = require.resolve('./fork-release-policy.cjs')
    const buildSourcePath = require.resolve('./fork-build-source.cjs')
    const originalPolicy = require.cache[sourcePolicyPath].exports
    const originalBuildSource = require.cache[buildSourcePath].exports
    const originals = Object.fromEntries(
      ['ORCA_MANUAL_UPDATES_ONLY', 'ORCA_LOCAL_BUILD_VERSION', 'ORCA_BUILD_COMMIT', 'MPX_APPS'].map(
        (name) => [name, process.env[name]]
      )
    )
    const scratch = await mkdtemp(join(tmpdir(), 'orca-manual-proof-'))
    const source = { repository: 'MartinoPolo/orca', branch: 'main', commit: 'a'.repeat(40) }
    const calls = []
    try {
      process.env.ORCA_MANUAL_UPDATES_ONLY = '1'
      process.env.ORCA_LOCAL_BUILD_VERSION = '1.4.159-local.20260924100739.gaaaaaaaa'
      process.env.ORCA_BUILD_COMMIT = source.commit
      process.env.MPX_APPS = scratch
      require.cache[sourcePolicyPath].exports = {
        ...originalPolicy,
        assertForkReleaseSource: () => source
      }
      require.cache[buildSourcePath].exports = {
        ...originalBuildSource,
        assertForkBuildSource: (details) => {
          calls.push(details)
          throw new Error('Fork build proof is missing')
        }
      }
      delete require.cache[configPath]
      const config = require('../electron-builder.config.cjs')
      for (const electronPlatformName of ['win32', 'darwin', 'linux']) {
        expect(() => config.beforePack({ electronPlatformName, arch: 1 })).toThrow(
          /proof is missing/
        )
      }
      expect(calls).toHaveLength(3)
      expect(calls[0]).toMatchObject({ source, version: process.env.ORCA_LOCAL_BUILD_VERSION })
    } finally {
      for (const [name, value] of Object.entries(originals)) {
        if (value === undefined) {
          delete process.env[name]
        } else {
          process.env[name] = value
        }
      }
      require.cache[sourcePolicyPath].exports = originalPolicy
      require.cache[buildSourcePath].exports = originalBuildSource
      delete require.cache[configPath]
      require('../electron-builder.config.cjs')
      await rm(scratch, { recursive: true, force: true })
    }
  })
})
