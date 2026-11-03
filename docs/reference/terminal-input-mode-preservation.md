# Terminal input mode preservation

Terminal applications negotiate input protocols independently of their painted screen. A restored
frame must retain those protocols; repainting alone does not renegotiate them.

- Snapshots clear the destination's mouse modes, then re-arm the source's tracking and encoding
  (`src/shared/terminal-serialize-absolute-cursor.ts`). Upstream restores only the encoding, so a
  reused destination would otherwise keep tracking the application already turned off.
- Mobile must not turn an unencodable mouse-wheel report into an arrow key: that can edit a TUI's
  input instead of scrolling its transcript. Alternate-screen applications without wheel tracking
  retain their existing arrow-scroll behavior.
- Negotiated unshifted printable Alt shortcuts on Windows/Linux use the application-owned Kitty mode mirror,
  as macOS Option shortcuts do. Renderer-only interrupt/replay resets must not change the encoding
  expected by a surviving application. Keep legacy input, AltGr, composition, and dead-shell cleanup
  intact; do not enable Kitty globally on Windows to compensate.

These safeguards do not force mouse reporting back on after an application or ConPTY disables it.
For fullscreen Pi, switching TUI mode off and on reinitializes mouse reporting; `/model` bypasses a
broken model-picker shortcut. Diagnose remaining failures by comparing application negotiation,
renderer mouse modes, and emitted shortcut bytes rather than recording arbitrary typed input.

Desktop wheel input becomes arrow keys whenever an alternate-screen pane has no mouse tracking. The
renderer probe (`pty-connection/mouse-tracking-loss-probe.ts`) records two breadcrumbs in
`<userData>/logs/main.trace.ndjson`:

- `terminal_mouse_tracking_lost`: tracking stayed off on the alternate screen. `source` separates
  Orca replay writes from application output, and `orcaReset` names the Orca reset profile written
  just before.
- `terminal_wheel_arrow_fallback`: the user wheeled while tracking was off. `everArmed: false` means
  the restored pane never had tracking.
