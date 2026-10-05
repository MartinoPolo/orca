import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type * as FileSystem from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/test/user-data' } }))
vi.mock('../git-bash', () => ({ isGitBashAvailable: () => true }))
vi.mock('node:fs', async (importOriginal) => {
  const filesystem = await importOriginal<typeof FileSystem>()
  return {
    ...filesystem,
    readFileSync: vi.fn(filesystem.readFileSync),
    writeFileSync: vi.fn(filesystem.writeFileSync),
    rmSync: vi.fn(filesystem.rmSync)
  }
})

import { ClaudeHookService } from './hook-service'

let homeDirectory: string
beforeEach(() => {
  homeDirectory = mkdtempSync(join(tmpdir(), 'orca-claude-profile-hooks-'))
  vi.stubEnv('HOME', homeDirectory)
  vi.stubEnv('USERPROFILE', homeDirectory)
  vi.clearAllMocks()
})
afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(homeDirectory, { recursive: true, force: true })
})

describe('Claude profile hook lifecycle', () => {
  it('installs and removes profile hooks without changing user hooks, credentials, or the shared launcher', () => {
    const configDirectory = join(homeDirectory, 'work-account')
    mkdirSync(configDirectory)
    const configPath = join(configDirectory, 'settings.json')
    const credentialsPath = join(configDirectory, '.credentials.json')
    const userHook = { hooks: [{ type: 'command', command: 'company-hook' }] }
    const userSettings = {
      env: { CUSTOM_SETTING: 'keep' },
      apiKeyHelper: 'company-key-helper',
      statusLine: { type: 'command', command: 'company-statusline' },
      hooks: { Stop: [userHook] }
    }
    writeFileSync(configPath, JSON.stringify(userSettings))
    writeFileSync(credentialsPath, 'untouched credentials')
    vi.clearAllMocks()
    const service = new ClaudeHookService()
    expect(service.install({ configDirectory }).state).toBe('installed')
    expect(service.install({ configDirectory }).state).toBe('installed')
    expect(service.getStatus(configDirectory)).toMatchObject({ state: 'installed', configPath })
    const installed = JSON.parse(readFileSync(configPath, 'utf8'))
    expect(installed.hooks.Stop).toHaveLength(2)
    expect(installed.hooks.Stop).toContainEqual(userHook)
    expect(installed.statusLine).toEqual(userSettings.statusLine)
    expect(existsSync(join(homeDirectory, '.claude', 'settings.json'))).toBe(false)

    expect(service.remove(configDirectory).state).toBe('not_installed')
    expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual(userSettings)
    const scriptName = process.platform === 'win32' ? 'claude-hook.cmd' : 'claude-hook.sh'
    expect(existsSync(join(homeDirectory, '.orca', 'agent-hooks', scriptName))).toBe(true)
    const accessedPaths = [
      ...vi.mocked(readFileSync).mock.calls.map(([path]) => path),
      ...vi.mocked(writeFileSync).mock.calls.map(([path]) => path),
      ...vi.mocked(rmSync).mock.calls.map(([path]) => path)
    ]
    expect(accessedPaths).not.toContain(credentialsPath)
    expect(readFileSync(credentialsPath, 'utf8')).toBe('untouched credentials')
  })

  it('keeps the default statusline opt-out marker and other accounts installed when retiring one profile', () => {
    const service = new ClaudeHookService()
    const retiredDirectory = join(homeDirectory, 'retired-account')
    const activeDirectory = join(homeDirectory, 'active-account')
    expect(service.install().state).toBe('installed')
    expect(service.install({ configDirectory: retiredDirectory }).state).toBe('installed')
    expect(service.install({ configDirectory: activeDirectory }).state).toBe('installed')
    const markerPath = join(homeDirectory, '.orca', 'agent-hooks', 'claude-statusline.installed')
    expect(existsSync(markerPath)).toBe(true)
    expect(service.remove(retiredDirectory).state).toBe('not_installed')
    expect(service.getStatus().state).toBe('installed')
    expect(service.getStatus(activeDirectory).state).toBe('installed')
    expect(existsSync(markerPath)).toBe(true)
  })

  it('leaves malformed profile settings unchanged and does not fall back to the default config', () => {
    const configDirectory = join(homeDirectory, 'broken-account')
    mkdirSync(configDirectory)
    const configPath = join(configDirectory, 'settings.json')
    writeFileSync(configPath, '{ malformed settings')
    const service = new ClaudeHookService()
    expect(service.install({ configDirectory })).toMatchObject({ state: 'error', configPath })
    expect(service.remove(configDirectory)).toMatchObject({ state: 'error', configPath })
    expect(readFileSync(configPath, 'utf8')).toBe('{ malformed settings')
    expect(existsSync(join(homeDirectory, '.claude', 'settings.json'))).toBe(false)
  })

  it('refuses relative config roots before accessing any config', () => {
    const service = new ClaudeHookService()
    expect(() => service.install({ configDirectory: 'relative/account' })).toThrow(/absolute/i)
    expect(() => service.getStatus('relative/account')).toThrow(/absolute/i)
    expect(() => service.remove('relative/account')).toThrow(/absolute/i)
    expect(readFileSync).not.toHaveBeenCalled()
    expect(writeFileSync).not.toHaveBeenCalled()
  })
})
