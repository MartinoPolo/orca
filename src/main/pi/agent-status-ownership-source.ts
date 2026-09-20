import type { PiAgentKind } from '../../shared/pi-agent-kind'
import { getPiTerminalOwnerContextSourceLines } from './terminal-owner-context-source'

export function getPiAgentStatusOwnershipSourceLines(kind: PiAgentKind): string[] {
  if (kind !== 'pi') {
    return ['  const on = (name, handler) => pi.on(name, handler)', '']
  }

  return [
    ...getPiTerminalOwnerContextSourceLines(),
    "  const ownersKey = Symbol.for('orca.pi.status.owners')",
    '  const owners = globalThis[ownersKey] ??= new Map()',
    '  const paneKey = process.env.ORCA_PANE_KEY',
    '  let ownsPane = false',
    '  let disposed = false',
    '  const ownership = { sessionId: undefined, dispose }',
    '',
    '  function dispose() {',
    '    disposed = true',
    '    pendingPost = null',
    '    activePostController?.abort()',
    '    clearPendingAgentEndCheck()',
    '    if (owners.get(paneKey) === ownership) owners.delete(paneKey)',
    '    return previousDelivery ? previousDelivery.then(() => activeDelivery) : activeDelivery',
    '  }',
    '',
    '  function on(name, handler) {',
    '    pi.on(name, (event, ctx) => {',
    '      if (disposed) return',
    '      if (!isOmpRuntime()) {',
    '        if (!isTerminalOwnerContext(ctx, true)) return',
    '        const sessionId = ctx?.sessionManager?.getSessionId?.()',
    '        if (!ownsPane) {',
    '          const previous = owners.get(paneKey)',
    '          // Why: print-mode SDK children inherit CLI argv; only the current session may reload its lease.',
    "          if (previous && ctx?.mode !== 'rpc' && isHeadlessOwnerContext(ctx) &&",
    "              !(name === 'session_start' && event?.reason === 'reload' && sessionId && previous.sessionId === sessionId)) return",
    '          previousDelivery = previous?.dispose() ?? null',
    '          owners.set(paneKey, ownership)',
    '          ownsPane = true',
    '          process.env.ORCA_PI_STATUS_OWNED = String(process.pid)',
    '        }',
    '        if (sessionId !== undefined) ownership.sessionId = sessionId',
    '      }',
    "      if (name === 'session_shutdown') {",
    '        clearPendingAgentEndCheck()',
    '        pendingPost = null',
    '      }',
    '      return handler(event, ctx)',
    '    })',
    '  }',
    ''
  ]
}
