import { RESET_MOUSE_REPORTING } from './terminal-mode-reset-profiles'

/** Mouse report encoding armed by DECSET 1006 (SGR) or 1016 (SGR pixels); independent of the tracking protocol. */
export type TerminalMouseEncoding = 'default' | 'sgr' | 'sgr-pixels'

/** Private xterm surface read below; optional because an xterm upgrade can move or drop it. */
type TerminalWithMouseStateCore = {
  // Why: required public members keep this from being a weak type, so xterm Terminals assign uncast.
  readonly cols: number
  readonly rows: number
  _core?: { mouseStateService?: { activeEncoding?: unknown; activeProtocol?: unknown } }
}

const MOUSE_PROTOCOL_ENABLE = new Map<unknown, string>([
  ['NONE', ''],
  ['X10', '\x1b[?9h'],
  ['VT200', '\x1b[?1000h'],
  ['DRAG', '\x1b[?1002h'],
  ['ANY', '\x1b[?1003h']
])

const KNOWN_MOUSE_ENCODINGS = new Set<unknown>(['DEFAULT', 'SGR', 'SGR_PIXELS'])

/**
 * Reads the encoding xterm itself parsed. Its public `modes` exposes the
 * tracking protocol but not the encoding, and SerializeAddon omits it, so a
 * restored pane otherwise emits legacy `ESC [ M` reports that a ConPTY host
 * types into the app as text (#23818).
 */
export function readTerminalMouseEncoding(
  terminal: TerminalWithMouseStateCore
): TerminalMouseEncoding {
  const encoding = terminal._core?.mouseStateService?.activeEncoding
  if (encoding === 'SGR') {
    return 'sgr'
  }
  if (encoding === 'SGR_PIXELS') {
    return 'sgr-pixels'
  }
  return 'default'
}

export function buildMouseEncodingRestoreSequence(encoding: TerminalMouseEncoding): string {
  switch (encoding) {
    case 'sgr':
      return '\x1b[?1006h'
    case 'sgr-pixels':
      return '\x1b[?1016h'
    case 'default':
      return ''
  }
}

/**
 * Re-arms the source's tracking protocol and encoding after clearing the
 * destination's, because a reused destination can carry stale tracking or
 * encoding that the addon's mode trailer never turns off. Empty when xterm's
 * private state is missing or unrecognized, so the destination stays untouched.
 */
export function buildMouseReportingRestoreSequence(terminal: TerminalWithMouseStateCore): string {
  const mouseState = terminal._core?.mouseStateService
  const protocolEnable = MOUSE_PROTOCOL_ENABLE.get(mouseState?.activeProtocol)
  if (protocolEnable === undefined || !KNOWN_MOUSE_ENCODINGS.has(mouseState?.activeEncoding)) {
    return ''
  }
  const encodingEnable = buildMouseEncodingRestoreSequence(readTerminalMouseEncoding(terminal))
  return `${RESET_MOUSE_REPORTING}${protocolEnable}${encodingEnable}`
}
