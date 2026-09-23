import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => {
  const paths = new Map<string, string>([['appData', '/tmp/app-data']])
  return {
    app: {
      getPath: vi.fn((name: string) => paths.get(name) ?? ''),
      setPath: vi.fn((name: string, value: string) => {
        paths.set(name, value)
      }),
      isPackaged: false
    }
  }
})

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

describe('configureDevUserDataPath for Orca Lab', () => {
  it('isolates Lab state without changing the inherited environment or normal Electron paths', async () => {
    const { app } = await import('electron')
    const { configureDevUserDataPath } = await import('./configure-process')
    const labRoot = mkdtempSync(join(tmpdir(), 'orca-configure-lab-'))
    const labProfile = join(labRoot, 'profile')
    const originalLabRoot = process.env.ORCA_LAB_ROOT
    const inheritedEnvironment = {
      HOME: process.env.HOME,
      USERPROFILE: process.env.USERPROFILE,
      APPDATA: process.env.APPDATA,
      LOCALAPPDATA: process.env.LOCALAPPDATA
    }
    const normalHome = resolve(tmpdir(), 'normal-home')
    const normalAppData = resolve(tmpdir(), 'normal-app-data')
    process.env.ORCA_LAB_ROOT = labRoot
    Object.defineProperty(app, 'isPackaged', { configurable: true, value: true })
    app.setPath('home', normalHome)
    app.setPath('appData', normalAppData)
    // A CLI --user-data-dir switch may have already selected the intended Lab profile.
    app.setPath('userData', labProfile)
    vi.mocked(app.setPath).mockClear()

    try {
      configureDevUserDataPath(false)

      expect(app.getPath('home')).toBe(normalHome)
      expect(app.getPath('appData')).toBe(normalAppData)
      expect(app.setPath).toHaveBeenCalledWith('userData', labProfile)
      expect(app.setPath).toHaveBeenCalledWith('sessionData', labProfile)
      expect(vi.mocked(app.setPath).mock.calls).toEqual([
        ['userData', labProfile],
        ['sessionData', labProfile]
      ])
      expect({
        HOME: process.env.HOME,
        USERPROFILE: process.env.USERPROFILE,
        APPDATA: process.env.APPDATA,
        LOCALAPPDATA: process.env.LOCALAPPDATA
      }).toEqual(inheritedEnvironment)
    } finally {
      rmSync(labRoot, { recursive: true, force: true })
      restoreEnv('ORCA_LAB_ROOT', originalLabRoot)
      app.setPath('home', '')
      app.setPath('appData', '/tmp/app-data')
      Object.defineProperty(app, 'isPackaged', { configurable: true, value: false })
    }
  })

  it('does not use the undocumented cache path alias', async () => {
    const { app } = await import('electron')
    const { configureDevUserDataPath } = await import('./configure-process')
    const labRoot = mkdtempSync(join(tmpdir(), 'orca-configure-lab-no-cache-'))
    const originalLabRoot = process.env.ORCA_LAB_ROOT
    process.env.ORCA_LAB_ROOT = labRoot
    Object.defineProperty(app, 'isPackaged', { configurable: true, value: true })
    const getPathSpy = vi.spyOn(app, 'getPath').mockImplementation((name) => {
      if (String(name) === 'cache') {
        throw new Error('Unknown app path')
      }
      return name === 'appData' ? resolve(tmpdir(), 'normal-app-data') : ''
    })
    vi.mocked(app.setPath).mockClear()

    try {
      configureDevUserDataPath(false)
      expect(app.getPath).not.toHaveBeenCalledWith('cache')
      expect(app.setPath).not.toHaveBeenCalledWith('cache', expect.any(String))
    } finally {
      getPathSpy.mockRestore()
      rmSync(labRoot, { recursive: true, force: true })
      restoreEnv('ORCA_LAB_ROOT', originalLabRoot)
      Object.defineProperty(app, 'isPackaged', { configurable: true, value: false })
    }
  })

  it('rejects Orca Lab combined with an E2E or development override', async () => {
    const { app } = await import('electron')
    const { configureDevUserDataPath } = await import('./configure-process')
    const originalLabRoot = process.env.ORCA_LAB_ROOT
    const originalE2EUserDataDir = process.env.ORCA_E2E_USER_DATA_DIR
    const originalE2EHeadless = process.env.ORCA_E2E_HEADLESS
    const originalDevUserDataPath = process.env.ORCA_DEV_USER_DATA_PATH
    process.env.ORCA_LAB_ROOT = resolve(tmpdir(), 'orca-lab-conflict')
    process.env.ORCA_E2E_USER_DATA_DIR = resolve(tmpdir(), 'orca-e2e-conflict')
    Object.defineProperty(app, 'isPackaged', { configurable: true, value: true })

    try {
      expect(() => configureDevUserDataPath(false)).toThrow(/cannot be combined/)
      delete process.env.ORCA_E2E_USER_DATA_DIR
      process.env.ORCA_E2E_HEADLESS = '1'
      expect(() => configureDevUserDataPath(false)).toThrow(/cannot be combined/)
      delete process.env.ORCA_E2E_HEADLESS
      process.env.ORCA_DEV_USER_DATA_PATH = resolve(tmpdir(), 'orca-dev-conflict')
      expect(() => configureDevUserDataPath(false)).toThrow(/cannot be combined/)
    } finally {
      restoreEnv('ORCA_LAB_ROOT', originalLabRoot)
      restoreEnv('ORCA_E2E_USER_DATA_DIR', originalE2EUserDataDir)
      restoreEnv('ORCA_E2E_HEADLESS', originalE2EHeadless)
      restoreEnv('ORCA_DEV_USER_DATA_PATH', originalDevUserDataPath)
      Object.defineProperty(app, 'isPackaged', { configurable: true, value: false })
    }
  })
})
