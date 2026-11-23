import type { ReleaseBuild, ReleaseChannel } from '../../../shared/updater/release-channel'
import type { ReleaseBuildListOptions } from '../releases/updater-release-build-cache'
import type {
  LinuxPackageInstallInstructions,
  UpdateCheckOptions
} from '../../../shared/updater/update-status-types'
import { UpdaterDownloadInstall } from './updater-download-install'
import { isManualUpdateBuild } from './manual-update-build'
import type { UpdateInstallTrigger } from './updater-state'

const MANUAL_UPDATE_MESSAGE =
  'Automatic updates are disabled in this custom build. Install updates manually.'

/** Custom builds with manual updates only: background work stays silent, explicit actions report why they are refused. */
export abstract class UpdaterManualUpdateGuard extends UpdaterDownloadInstall {
  protected manualUpdatesOnly(): boolean {
    return isManualUpdateBuild()
  }

  private rejectManualUpdateAction(): boolean {
    if (!isManualUpdateBuild()) {
      return false
    }
    this.sendErrorStatus(MANUAL_UPDATE_MESSAGE, true)
    return true
  }

  protected override checkForUpdatesInBackground(): void {
    if (!isManualUpdateBuild()) {
      super.checkForUpdatesInBackground()
    }
  }

  protected override downloadAvailableUpdateAutomatically(): void {
    if (!isManualUpdateBuild()) {
      super.downloadAvailableUpdateAutomatically()
    }
  }

  protected override checkForUpdatesFromMenu(options?: UpdateCheckOptions): void {
    if (!this.rejectManualUpdateAction()) {
      super.checkForUpdatesFromMenu(options)
    }
  }

  protected override downloadUpdate(automatic = false): void {
    if (!this.rejectManualUpdateAction()) {
      super.downloadUpdate(automatic)
    }
  }

  protected override quitAndInstall(
    trigger: UpdateInstallTrigger = 'manual',
    isCurrentTeamRestart?: () => boolean
  ): void {
    if (!this.rejectManualUpdateAction()) {
      super.quitAndInstall(trigger, isCurrentTeamRestart)
    }
  }

  protected override async getLinuxPackageInstallInstructions(): Promise<LinuxPackageInstallInstructions> {
    if (this.rejectManualUpdateAction()) {
      throw new Error(MANUAL_UPDATE_MESSAGE)
    }
    return super.getLinuxPackageInstallInstructions()
  }

  protected override async showLinuxPackage(): Promise<void> {
    if (this.rejectManualUpdateAction()) {
      throw new Error(MANUAL_UPDATE_MESSAGE)
    }
    return super.showLinuxPackage()
  }

  protected override async listAvailableReleaseBuilds(
    channel: ReleaseChannel,
    options?: ReleaseBuildListOptions
  ): Promise<ReleaseBuild[]> {
    if (isManualUpdateBuild()) {
      return []
    }
    return super.listAvailableReleaseBuilds(channel, options)
  }
}
