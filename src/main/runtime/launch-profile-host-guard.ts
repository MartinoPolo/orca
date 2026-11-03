import type { AgentLaunchProfile } from '../../shared/agent-launch-profiles'

/** Profile account roots are this computer's paths; an SSH or WSL launch would read them on another machine. */
export function assertLaunchProfileRunsLocally(
  profile: AgentLaunchProfile | undefined,
  isRemote: boolean,
  launchPlatform: NodeJS.Platform
): void {
  if (profile && (isRemote || launchPlatform !== process.platform)) {
    throw new Error(
      `Launch profile ${profile.name} runs only in workspaces on this computer, not over SSH or in WSL.`
    )
  }
}
