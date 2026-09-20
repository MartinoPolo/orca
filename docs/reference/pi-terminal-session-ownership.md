# Pi terminal session ownership

Pi SDK subagents can share their parent's process and cached extension module. A PID
marker alone cannot distinguish them from the session that owns an Orca pane.
Persisted child transcripts are valid history, but must not replace the pane's main
session identity or dispose its status/titlebar handlers.

## Ownership admission

Modern Pi exposes `ctx.mode`: `tui` owns terminal UI, whereas `rpc` has UI
capabilities but does not paint the local terminal. SDK children normally bind with
print-mode/no-op UI. `hasUI` alone is therefore not an ownership test.

Status accepts explicit CLI print/JSON/RPC modes, but print/JSON activations also
need a same-process lease: CLI arguments alone are inherited by SDK children. The
first eligible activation claims that lease; another print/JSON activation may
replace it only for a reload of the same session. This relies on the CLI binding
its main session before starting SDK work. Context alone cannot prove ownership
if an extension starts a headless child before the main print session is bound.
Legacy contexts without mode/UI fields retain compatibility behavior.

Titlebar ownership is deferred until a terminal-context event. Loading a child
factory does not retire the parent. A verified replacement retires old callbacks,
queued status, and timers. Replacement delivery waits for the previous transport
to settle after cancellation, retaining the existing bounded timeout. A request
already delivered to the hook receiver cannot be recalled; no receiver-side
producer-generation fence is added. Pending deliveries must not acquire another
session's identity.

OMP retains its runtime-specific status path, and Prime retains its daemon-worker
boundary. No transcript ancestry is consulted and no transcript is altered.

## Required boundaries

- Keep session metadata, pending transport, modal state, and lifecycle timers local
  to each extension activation.
- Admit terminal ownership using runtime context before mutating owner state. Do
  not use transcript ancestry: interactive forks legitimately have parents.
- Deliver queued status with its captured identity, including the transcript-path
  persistence check. Never substitute the current session at delivery time.
- Preserve intentional session switches, forks, reloads, stale-PID recovery, and
  supported OMP/Prime execution paths.
- Apply the boundary on the execution host. Local, WSL, and SSH panes use the same
  generated extension; no client-side inference or wire-format change is needed.

This is a forward-only fix. Keep saved subagent sessions enabled. Do not rewrite
historical pane mappings, delete transcripts, or infer that an unreachable remote
process has exited.

## Validation and deployment

Use generated-extension tests with synthetic sessions and mocked transport before
launching a build. Cover same-process activations, child shutdown, delayed delivery,
reload, intentional session changes, and noninteractive runtime compatibility.

A desktop test requires disposable user data **and** disposable agent homes. The
E2E home helper does not remove every inherited agent-directory variable; explicitly
isolate Pi/OMP/Prime directories and hook endpoints as well as HOME, USERPROFILE,
APPDATA, and LOCALAPPDATA. Always set `ORCA_BACKGROUND_LAUNCH=1`. Never reuse a live
transcript for a disposable-session test.

An unpacked build is preferable to installer validation on a working desktop. An
alternate installer directory does not isolate Windows registration or shortcuts.
Read [Windows daemon-host relocation](windows-daemon-host-relocation.md) before
packaging or cutover. Closing the running app or replacing its installation requires
explicit approval and a stopped-state backup.

Forking the repository does not redirect updates: `updater-setup.ts` and
`updater-release-feed.ts` select the upstream release feed, and the packaging config
also names upstream. A maintained fork must deliberately disable or redirect those
paths before deployment. Do not disable signature verification to make an unsigned
fork appear compatible with upstream signing.

### Manual-update custom builds

Set `ORCA_MANUAL_UPDATES_ONLY=1` for both compilation and packaging. Compilation
immutably disables local automatic-update execution; packaging records
`orcaManualUpdatesOnly: true` and removes publish configuration for deployment
verification. Setting or clearing the environment variable after the build cannot
toggle this policy. Manual deployment does not bypass installer or release-signature
verification.
