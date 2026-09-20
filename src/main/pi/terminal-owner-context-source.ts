export function getPiTerminalOwnerContextSourceLines(): string[] {
  return [
    'function isHeadlessOwnerContext(ctx): boolean {',
    "  return ctx?.mode === 'print' || ctx?.mode === 'json' || ctx?.mode === 'rpc' || ctx?.hasUI === false",
    '}',
    '',
    'function isTerminalOwnerContext(ctx, allowHeadless = false): boolean {',
    "  if (ctx?.mode === 'tui') return true",
    '  if (!isHeadlessOwnerContext(ctx)) return true',
    '  if (!allowHeadless) return false',
    '  const args = process.argv.slice(2)',
    "  const modeIndex = args.indexOf('--mode')",
    "  const mode = modeIndex >= 0 ? args[modeIndex + 1] : args.find((arg) => arg.startsWith('--mode='))?.slice(7)",
    "  if (ctx?.mode === 'rpc') return mode === 'rpc'",
    "  if (mode === 'rpc') return false",
    "  return mode === 'text' || mode === 'json' || args.includes('-p') || args.includes('--print')",
    '}',
    ''
  ]
}
