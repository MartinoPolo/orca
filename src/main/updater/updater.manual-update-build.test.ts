import type { getReleaseDownloadUrl } from './releases/updater-release-readiness'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadUpdaterModule, warmUpdaterModule } from './testing/updater-test-module-loader'
import { updaterMainWindow } from './testing/updater-test-main-window'

const {
  autoUpdaterMock,
  powerMonitorOnMock,
  fetchNudgeMock,
  fetchNewerReleaseTagsMock,
  moduleFactories,
  resetUpdaterMocks
} = await vi.hoisted(async () =>
  (await import('./testing/updater-test-harness')).createUpdaterMocks()
)

vi.mock('electron', () => moduleFactories.electron())
vi.mock('electron-updater', () => moduleFactories.electronUpdater())
vi.mock('./electron-updater-loader', () => moduleFactories.electronUpdaterLoader())
vi.mock('../ipc/pty/kill-all', () => moduleFactories.ptyKillAll())
vi.mock('./linux-package/linux-update-package-type', () => moduleFactories.linuxUpdatePackageType())
vi.mock('./updater-lifecycle-diagnostics', () => moduleFactories.updaterLifecycleDiagnostics())
vi.mock('./releases/updater-changelog', () => moduleFactories.updaterChangelog())
vi.mock('./nudges/nudge-campaign', () => moduleFactories.updaterNudge())
vi.mock('./update-install-exit-watchdog', () => moduleFactories.updateInstallExitWatchdog())
vi.mock('./releases/updater-prerelease-feed', () => moduleFactories.updaterPrereleaseFeed())
vi.mock('./releases/updater-release-readiness', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getReleaseDownloadUrl: (
    await vi.importMock<{
      getReleaseDownloadUrl: typeof getReleaseDownloadUrl
    }>('./releases/updater-prerelease-feed')
  ).getReleaseDownloadUrl
}))
vi.mock('../local-builds/local-build-switch', () => moduleFactories.localBuildSwitch())
vi.mock('../local-builds/local-build-feed-server', () => moduleFactories.localBuildFeedServer())


warmUpdaterModule()

const MANUAL_UPDATE_MESSAGE =
  'Automatic updates are disabled in this custom build. Install updates manually.'


describe('manual-update build updater boundary', () => {
  beforeEach(() => {
    resetUpdaterMocks()
    vi.useFakeTimers()
    vi.stubGlobal('ORCA_MANUAL_UPDATES_ONLY', true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to normal update behavior when the compile constant is unavailable', async () => {
    vi.unstubAllGlobals()
    const { isManualUpdateBuild } = await import('./lifecycle/manual-update-build')

    expect(isManualUpdateBuild()).toBe(false)
  })

  it('retains setup options without loading, configuring, polling, or scheduling the updater', async () => {
    const send = vi.fn()
    const onBeforeQuit = vi.fn()
    const { setupAutoUpdater } = await loadUpdaterModule()

    setupAutoUpdater(updaterMainWindow(send), {
      onBeforeQuit,
      getLastUpdateCheckAt: () => null
    })

    expect(autoUpdaterMock.updateConfigPath).toBeUndefined()
    expect(autoUpdaterMock.setFeedURL).not.toHaveBeenCalled()
    expect(autoUpdaterMock.on).not.toHaveBeenCalled()
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
    expect(fetchNudgeMock).not.toHaveBeenCalled()
    expect(powerMonitorOnMock).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('silently ignores automatic local update checks', async () => {
    const send = vi.fn()
    const updater = await loadUpdaterModule()
    updater.setupAutoUpdater(updaterMainWindow(send))

    updater.checkForUpdates()

    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('rejects explicit local check, download, and install commands with the manual-update status', async () => {
    const send = vi.fn()
    const updater = await loadUpdaterModule()
    updater.setupAutoUpdater(updaterMainWindow(send))

    updater.checkForUpdatesFromMenu()
    updater.downloadUpdate()
    updater.quitAndInstall()

    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
    expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled()
    expect(autoUpdaterMock.quitAndInstall).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith('updater:status', {
      state: 'error',
      message: MANUAL_UPDATE_MESSAGE,
      userInitiated: true
    })
  })

  it('does not discover release builds for local selection', async () => {
    const updater = await loadUpdaterModule()

    await expect(updater.listAvailableReleaseBuilds('stable')).resolves.toEqual([])
    expect(fetchNewerReleaseTagsMock).not.toHaveBeenCalled()
  })

  it('blocks Linux package recovery actions before they can expose a local installer', async () => {
    const send = vi.fn()
    const updater = await loadUpdaterModule()
    updater.setupAutoUpdater(updaterMainWindow(send))

    await expect(updater.getLinuxPackageInstallInstructions()).rejects.toThrow(
      MANUAL_UPDATE_MESSAGE
    )
    await expect(updater.showLinuxPackage()).rejects.toThrow(MANUAL_UPDATE_MESSAGE)
    expect(send).toHaveBeenCalledWith('updater:status', {
      state: 'error',
      message: MANUAL_UPDATE_MESSAGE,
      userInitiated: true
    })
  })
})
