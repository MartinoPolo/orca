// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { ESC, useTerminalMouseWebViewHarness } from './terminal-webview-mouse-test-harness'

const CELL_HEIGHT = 15
const WIDE_TERMINAL_COLUMNS = 140

describe('terminal WebView mouse wheel encoding', () => {
  const mouse = useTerminalMouseWebViewHarness()

  function enableWideMouseTracking(): void {
    const terminal = mouse.activeTerminal()
    terminal.resize(WIDE_TERMINAL_COLUMNS, 24)
    terminal.modes.mouseTrackingMode = 'any'
  }

  it('drops an unencodable wide-coordinate legacy report', () => {
    mouse.boot()
    enableWideMouseTracking()

    mouse.mouseWheel(CELL_HEIGHT, 4000, 60)

    expect(mouse.terminalInputBytes()).toBe('')
  })

  it('uses restored SGR encoding for wide-coordinate reports', () => {
    mouse.boot('content\x1b[?1006h')
    enableWideMouseTracking()

    mouse.mouseWheel(CELL_HEIGHT, 4000, 60)

    const bytes = mouse.terminalInputBytes()
    expect(bytes.startsWith(`${ESC}[<65;${WIDE_TERMINAL_COLUMNS};`)).toBe(true)
    expect(bytes.endsWith('M')).toBe(true)
  })
})
