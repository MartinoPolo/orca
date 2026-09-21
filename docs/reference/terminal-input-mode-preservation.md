# Terminal input mode preservation

Terminal applications negotiate input protocols independently of their painted screen. A restored
frame must retain those protocols; repainting alone does not renegotiate them.

- Renderer snapshots carry mouse encoding through
  `src/shared/terminal-serialize-absolute-cursor.ts`, including encoding enabled while tracking is
  disabled. Tracking and SGR cell/pixel encoding are separate state. Standard ANSI sequences keep
  this compatible with existing desktop, SSH, and mobile snapshot consumers.
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
