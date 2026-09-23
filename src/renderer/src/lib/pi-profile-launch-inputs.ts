import type { AppState } from '@/store/types'
import type { TuiAgent } from '../../../shared/tui-agent'
import {
  buildPiLaunchProfileEnv,
  normalizePiLaunchProfile,
  type PiLaunchProfile
} from '../../../shared/pi-launch-profiles'
import { isLocalNativePiProfileTarget } from '@/lib/pi-profile-launch-target'

export type PiProfileLaunchInputs =
  | { ok: false }
  | {
      ok: true
      commandOverrides: Partial<Record<TuiAgent, string>>
      environment: Record<string, string>
    }

export function resolvePiProfileLaunchInputs(args: {
  agent: TuiAgent
  profile?: PiLaunchProfile
  state: AppState
  worktreeId: string
  resolvedLaunchPlatform: NodeJS.Platform
  clientPlatform: NodeJS.Platform
  commandOverrides: Partial<Record<TuiAgent, string>>
  environment: Record<string, string>
}): PiProfileLaunchInputs {
  if (!args.profile) {
    return {
      ok: true,
      commandOverrides: args.commandOverrides,
      environment: args.environment
    }
  }
  const profile = normalizePiLaunchProfile(args.profile)
  if (
    args.agent !== 'pi' ||
    !profile ||
    args.resolvedLaunchPlatform !== args.clientPlatform ||
    !isLocalNativePiProfileTarget(args.state, args.worktreeId, args.clientPlatform)
  ) {
    return { ok: false }
  }
  return {
    ok: true,
    commandOverrides: { ...args.commandOverrides, pi: profile.command },
    environment: { ...args.environment, ...buildPiLaunchProfileEnv(profile) }
  }
}
