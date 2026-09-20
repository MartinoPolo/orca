import type { PiAgentKind } from '../../shared/pi-agent-kind'

export function getPiTitlebarLifetimeSourceLines(kind: PiAgentKind): string[] {
  return [
    '  // Why: replacement factories share the process realm, but only an active terminal owner',
    '  // may retire the old generation; SDK/RPC children inherit both the pane and the realm.',
    "  const ownersKey = Symbol.for('orca.pi.titlebar.owners')",
    '  const owners = globalThis[ownersKey] ??= new Map()',
    '  const paneKey = process.env.ORCA_PANE_KEY',
    '  let activated = false',
    '  let disposed = false',
    '  function clearOwnedTimers() {',
    '    clearPendingAgentEndCheck()',
    '    clearAnimation()',
    '    stopMarkerReassert()',
    '  }',
    '',
    '  function dispose() {',
    '    disposed = true',
    '    clearOwnedTimers()',
    '    resetPromptState()',
    '    if (owners.get(paneKey) === dispose) owners.delete(paneKey)',
    '  }',
    '  function activate(ctx) {',
    '    if (disposed) return false',
    ...(kind === 'pi'
      ? ['    if (!isOmpRuntime() && !isTerminalOwnerContext(ctx)) return false']
      : []),
    '    if (activated) return true',
    '    owners.get(paneKey)?.()',
    '    if (disposed) return false',
    '    activated = true',
    '    claimMarkerOwnership()',
    '    owners.set(paneKey, dispose)',
    '    return true',
    '  }',
    '',
    '  function on(name, handler) {',
    '    pi.on(name, (event, ctx) => {',
    '      if (activate(ctx)) return handler(event, ctx)',
    '    })',
    '  }',
    ''
  ]
}
