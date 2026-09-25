import type { ChildProcessWithoutNullStreams } from 'node:child_process'

import type { WslRelayRecoveryState } from './wsl-hook-relay-recovery'
import type { SshChannelMultiplexer } from '../ssh/ssh-channel-multiplexer'

/** Stores original distro casing for wsl.exe argv; manager map keys are lowercased. */
export type WslHookRelayState = WslRelayRecoveryState & {
  phase: 'starting' | 'running' | 'failed'
  child?: ChildProcessWithoutNullStreams
  mux?: SshChannelMultiplexer
  guestHome?: string
  codexHomePath?: string
  guestEndpointFilePath?: string
  opencodeOverlayDir?: string
  opencode2OverlayDir?: string
  failures: number
  connectedAt?: number
  lastInstallAt?: number
}
