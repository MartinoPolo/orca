import type { IDisposable } from '@xterm/xterm'
import { recordRendererCrashBreadcrumb } from '@/lib/crash-breadcrumb-recorder'
import {
  buildProcessBoundaryGround,
  CONFIRMED_SHELL_MODE_RESET,
  POST_REPLAY_DEAD_TUI_RESET,
  POST_REPLAY_MODE_RESET,
  POST_REPLAY_REATTACH_RESET,
  RESET_MOUSE_REPORTING
} from '../../../../../shared/terminal-mode-reset-profiles'
import { guardParserHandler } from '../terminal-parser-handler-guard'

// Diagnoses wheel input degrading into arrow keys: xterm does that on the alternate screen once mouse tracking is off.

type PrivateModeParams = (number | number[])[]

export type MouseTrackingLossProbeTerminal = {
  readonly modes: { readonly mouseTrackingMode: string }
  readonly buffer: { readonly active: { readonly type: string } }
  readonly parser: {
    registerCsiHandler: (
      id: { prefix?: string; final: string },
      handler: (params: PrivateModeParams) => boolean
    ) => IDisposable
  }
}

export type MouseTrackingLossProbe = IDisposable & {
  noteOrcaWrite: (data: string) => void
}

const MOUSE_TRACKING_MODES = new Set([9, 1000, 1002, 1003])
// A snapshot restore clears then re-arms tracking within one write; only a loss that outlasts it counts.
const LOSS_CONFIRM_MS = 500
const ORCA_WRITE_ATTRIBUTION_MS = 2000
const WHEEL_FALLBACK_REPORT_INTERVAL_MS = 30_000

const MOUSE_RESETTING_PROFILES: readonly (readonly [string, string])[] = [
  ['confirmed-shell', CONFIRMED_SHELL_MODE_RESET],
  ['dead-tui', POST_REPLAY_DEAD_TUI_RESET],
  ['reattach', POST_REPLAY_REATTACH_RESET],
  ['mode-reset', POST_REPLAY_MODE_RESET],
  ['process-boundary', buildProcessBoundaryGround({ keepFocusReporting: false })],
  ['process-boundary-keep-focus', buildProcessBoundaryGround({ keepFocusReporting: true })]
]

function classifyOrcaMouseReset(data: string): string | null {
  if (!data.includes(RESET_MOUSE_REPORTING)) {
    return null
  }
  const profile = MOUSE_RESETTING_PROFILES.find(([, sequence]) => data.startsWith(sequence))
  return profile ? profile[0] : 'snapshot'
}

function includesMouseTrackingMode(params: PrivateModeParams): boolean {
  return params.some((param) => typeof param === 'number' && MOUSE_TRACKING_MODES.has(param))
}

function elapsedSince(at: number | null, now: number): number | null {
  return at === null ? null : Math.round(now - at)
}

export function installMouseTrackingLossProbe(options: {
  terminal: MouseTrackingLossProbeTerminal
  wheelTarget: HTMLElement
  isReplaying: () => boolean
  identity: () => { paneId: number; ptyId: string | null }
  now?: () => number
}): MouseTrackingLossProbe {
  const { terminal, wheelTarget, isReplaying, identity } = options
  const now = options.now ?? (() => performance.now())
  let lastOrcaReset: { profile: string; at: number } | null = null
  let lastArmedAt: number | null = null
  let lastLossAt: number | null = null
  let lastWheelReportAt: number | null = null
  let pendingConfirm: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  const isAltScreenWithoutTracking = (): boolean =>
    terminal.buffer.active.type === 'alternate' && terminal.modes.mouseTrackingMode === 'none'

  const onPrivateModeReset = (params: PrivateModeParams): boolean => {
    if (
      !includesMouseTrackingMode(params) ||
      terminal.modes.mouseTrackingMode === 'none' ||
      terminal.buffer.active.type !== 'alternate'
    ) {
      return false
    }
    const detectedAt = now()
    const orcaReset =
      lastOrcaReset && detectedAt - lastOrcaReset.at <= ORCA_WRITE_ATTRIBUTION_MS
        ? lastOrcaReset.profile
        : null
    const source = isReplaying() ? 'orca-replay' : 'pty-output'
    const previousMode = terminal.modes.mouseTrackingMode
    if (pendingConfirm !== null) {
      clearTimeout(pendingConfirm)
    }
    pendingConfirm = setTimeout(() => {
      pendingConfirm = null
      if (disposed || !isAltScreenWithoutTracking()) {
        return
      }
      lastLossAt = detectedAt
      recordRendererCrashBreadcrumb('terminal_mouse_tracking_lost', {
        ...identity(),
        source,
        orcaReset,
        previousMode,
        msSinceArmed: elapsedSince(lastArmedAt, detectedAt)
      })
    }, LOSS_CONFIRM_MS)
    return false
  }

  const onPrivateModeSet = (params: PrivateModeParams): boolean => {
    if (includesMouseTrackingMode(params)) {
      lastArmedAt = now()
    }
    return false
  }

  const onWheel = (): void => {
    if (!isAltScreenWithoutTracking()) {
      return
    }
    const wheelAt = now()
    if (
      lastWheelReportAt !== null &&
      wheelAt - lastWheelReportAt < WHEEL_FALLBACK_REPORT_INTERVAL_MS
    ) {
      return
    }
    lastWheelReportAt = wheelAt
    recordRendererCrashBreadcrumb('terminal_wheel_arrow_fallback', {
      ...identity(),
      everArmed: lastArmedAt !== null,
      msSinceArmed: elapsedSince(lastArmedAt, wheelAt),
      msSinceLoss: elapsedSince(lastLossAt, wheelAt),
      lastOrcaReset: lastOrcaReset?.profile ?? null,
      msSinceOrcaReset: elapsedSince(lastOrcaReset?.at ?? null, wheelAt)
    })
  }

  const registrations = [
    terminal.parser.registerCsiHandler(
      { prefix: '?', final: 'l' },
      guardParserHandler('mouse-tracking-loss-probe-decrst', onPrivateModeReset)
    ),
    terminal.parser.registerCsiHandler(
      { prefix: '?', final: 'h' },
      guardParserHandler('mouse-tracking-loss-probe-decset', onPrivateModeSet)
    )
  ]
  wheelTarget.addEventListener('wheel', onWheel, { capture: true, passive: true })

  return {
    noteOrcaWrite: (data: string): void => {
      const profile = classifyOrcaMouseReset(data)
      if (profile !== null) {
        lastOrcaReset = { profile, at: now() }
      }
    },
    dispose: (): void => {
      disposed = true
      if (pendingConfirm !== null) {
        clearTimeout(pendingConfirm)
        pendingConfirm = null
      }
      for (const registration of registrations) {
        registration.dispose()
      }
      wheelTarget.removeEventListener('wheel', onWheel, { capture: true })
    }
  }
}
