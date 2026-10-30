import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/test/user-data' } }))
vi.mock('../git-bash', () => ({ isGitBashAvailable: () => true }))

import { ClaudeHookService } from './hook-service'

const CURRENT_CLAUDE = { claudeVersion: '2.1.261 (Claude Code)' }

let homeDirectory: string
beforeEach(() => {
  homeDirectory = mkdtempSync(join(tmpdir(), 'orca-claude-profile-hooks-'))
  vi.stubEnv('HOME', homeDirectory)
  vi.stubEnv('USERPROFILE', homeDirectory)
})
afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(homeDirectory, { recursive: true, force: true })
})

describe('Claude launch profile hook removal', () => {
  it('removes only the profile root entries, keeping user hooks and the shared launcher', () => {
    const configDir = join(homeDirectory, 'work-account')
    mkdirSync(configDir)
    const configPath = join(configDir, 'settings.json')
    const userHook = { hooks: [{ type: 'command', command: 'company-hook' }] }
    const userSettings = {
      env: { CUSTOM_SETTING: 'keep' },
      statusLine: { type: 'command', command: 'company-statusline' },
      hooks: { Stop: [userHook] }
    }
    writeFileSync(configPath, JSON.stringify(userSettings))
    const service = new ClaudeHookService()

    expect(service.install({ configDir, ...CURRENT_CLAUDE }).state).toBe('installed')
    expect(service.remove(configDir)).toMatchObject({ state: 'not_installed', configPath })

    expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual(userSettings)
    const scriptName = process.platform === 'win32' ? 'claude-hook.cmd' : 'claude-hook.sh'
    expect(existsSync(join(homeDirectory, '.orca', 'agent-hooks', scriptName))).toBe(true)
    expect(existsSync(join(homeDirectory, '.claude', 'settings.json'))).toBe(false)
  })

  it('keeps the default install and other profiles when retiring one profile', () => {
    const service = new ClaudeHookService()
    const retiredDir = join(homeDirectory, 'retired-account')
    const activeDir = join(homeDirectory, 'active-account')
    expect(service.install(CURRENT_CLAUDE).state).toBe('installed')
    expect(service.install({ configDir: retiredDir, ...CURRENT_CLAUDE }).state).toBe('installed')
    expect(service.install({ configDir: activeDir, ...CURRENT_CLAUDE }).state).toBe('installed')
    const markerPath = join(homeDirectory, '.orca', 'agent-hooks', 'claude-statusline.installed')
    const markerExisted = existsSync(markerPath)

    expect(service.remove(retiredDir).state).toBe('not_installed')

    expect(service.getStatus(CURRENT_CLAUDE).state).toBe('installed')
    expect(service.getStatus({ configDir: activeDir, ...CURRENT_CLAUDE }).state).toBe('installed')
    expect(existsSync(markerPath)).toBe(markerExisted)
  })

  it('refuses to treat the default home as a profile root', () => {
    const service = new ClaudeHookService()
    expect(service.install(CURRENT_CLAUDE).state).toBe('installed')

    expect(service.remove(join(homeDirectory, '.claude')).state).toBe('error')

    expect(service.getStatus(CURRENT_CLAUDE).state).toBe('installed')
  })
})
