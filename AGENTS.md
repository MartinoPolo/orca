# Fork

`main` is the maintained `MartinoPolo/orca` fork branch: it carries local reliability patches on top of [`stablyai/orca`](https://github.com/stablyai/orca) and is the source for the installed Orca app. Preserve these patches when syncing upstream.

## Fork Patches

- **Implemented:** `ORCA_MANUAL_UPDATES_ONLY=1` disables automatic updates and publishing for custom builds without weakening signature checks. Fork manual packages require a clean published `main` and a verified previous Lab source that `main` still contains, or that a published `backup/main-before-*` tag preserves after an intentional upstream rebase; pending development refs are recorded but excluded. Use `pnpm run build:fork` for a provenance-stamped Windows x64 Lab build, or `pnpm run build:fork:installer` for the same build as a normal NSIS installer under `MPX_APPS/Orca-Stable`.
- **Implemented:** Exclude private `notes/` deployment evidence and previous `dist/` builds from packages, including when packaging to an alternate output directory.
- **Implemented:** Require the pinned pnpm directly so self-downloading wrappers cannot rewrite the environment lockfile.
- **Implemented:** Keep verification portable with discovered Git Bash executables, platform-correct fixtures, and Git-compatible patch diff paths. Packaged CLI smoke checks use the shared bounded, hidden process runner.
- **Implemented:** Refresh Cursor's chat metadata index on a cached miss so newly created chats are found even when workspace directory timestamps do not change; coalesce refreshes per scan and preserve WSL refusal recovery.
- **Implemented:** Send Pi's Ctrl+Enter as CSI-u from trusted panes without enabling the protocol globally for Windows ConPTY shells.
- **Implemented:** Preserve negotiated Alt shortcuts through the application-owned Kitty mode mirror, and prevent unencodable mobile wheel reports from becoming editor arrow keys; see [`docs/reference/terminal-input-mode-preservation.md`](docs/reference/terminal-input-mode-preservation.md).
- **Implemented:** Windows desktop port discovery uses unfiltered `netstat` enumeration so IPv4 and IPv6 TCP listeners reach the existing scanner and workspace attribution. Parsing still requires the English `LISTENING` state.
- **Implemented:** Per-agent linked work-item prompt templates can prefill issue and review workspaces with workflows such as `/skill:mpx-execute {{artifact_url}}` while keeping launch drafts reviewable.
- **Implemented:** Named Pi and Claude profiles capture a concrete command and account root for launch, workspace creation, and account-aware resume (cold restore, sleeping-agent wake, and session history); a profile's `CLAUDE_CONFIG_DIR` wins over upstream managed-account routing. An optional home-relative remote root enables SSH profiles without sending local account paths to the host; WSL and paired targets remain excluded. See [`docs/reference/agent-launch-profiles.md`](docs/reference/agent-launch-profiles.md).
- **Implemented:** Automations can pin a named launch profile (account); model and effort use upstream's per-automation extra agent arguments. Dispatch resolves the profile from the dispatching desktop client's settings and fails the run when it is deleted or unavailable on the workspace host, never falling back to another account; session reuse requires the same account, and headless or paired-server dispatch refuses pinned automations.
- **Implemented:** Source control starts “Committed on Branch” collapsed on panel mount and workspace switches; committed files and their header use muted styling on a secondary surface, separated from visible active changes by a gap and divider.
- **Implemented:** Source control offers Amend Last Commit while HEAD is unpushed and Amend & Force Push (with lease) once it is published, blocked while the branch is behind; an empty message keeps the existing one. Automatic amend pushes capture HEAD and the destination before amendment and use a dedicated `git.pushWithLease` method with that explicit OID; missing leases or unsupported hosts stop after the local amend, never fall back to a bare lease. `git.amendCommit` remains separate so older hosts refuse it instead of creating a new commit; SSH worktrees reach both through the remote Orca runtime.
- **Implemented:** Add bindable directional tab moves that merge into direct neighboring tab groups or create splits, including from editors, floating terminals, and focused browser pages. Move-right takes `Mod+Alt+ArrowRight` (`Ctrl+Alt+Right` on Windows and Linux) from upstream's worktree history forward, which ships unbound.
- **Implemented:** Add session-scoped attention metadata, priority ordering, saved markers, and per-session sidebar/Activity treatments without changing execution-status authority or workspace-tree order. Session rows open their own context menu inside workspace cards; Activity rows extend upstream's thread menu.
- **Implemented:** Agent alerts offer separate done, input, and blocked/failure sounds for terminal and structured sessions through the shared attention delivery module, honoring machine mutes; desktop agent banners are reserved for P4/P5 (unprioritized alerts count as P3), while priority does not govern in-app attention or mobile fan-out. Runtime graph publication loads notification dispatch only after a qualifying failure transition to avoid a store initialization cycle.
- **Implemented:** The sidebar agent row matching the focused terminal pane carries a blue `--terminal-pane-locate` outline over attention surfaces, so switching tabs shows which agent is in view; non-agent terminals highlight nothing.
- **Implemented:** Sidebar agent lists start expanded; compact lists offer a collapse row only above three top-level agents. Explicit collapse choices survive sidebar remounts within the renderer session.
- **Implemented:** Terminal tab headers mark launch identity (Pi blue for every account, Claude orange, command launches green) with a bottom strip, softened on inactive tabs; only the active tab fills with its identity tint. Unread (yellow) and attention (red: needs input, interrupted, or failed) fill any tab, so a filled inactive tab always needs the user. Manual swatches, Automatic, and No color choices remain; ordinary terminals stay neutral, and command provenance persists as an optional `launchKind` layout creation fact.
- **Implemented:** `ORCA_LAB_ROOT` gives packaged builds a fail-closed separate Orca profile and storage while sharing the normal shell, development tools, and agent configuration. It retains a distinct Orca Lab identity and native window title without enabling E2E mode; see [`docs/reference/orca-lab-isolation.md`](docs/reference/orca-lab-isolation.md).

Add or update a one-to-three-sentence entry here for every fork-only patch.

## Installation

Run `pnpm run build:fork:installer` from a clean, published fork `main`, validate its unpacked build with isolated data in background mode, then stop Orca, back up its installation/profile/registry, and run the installer. The package carries no Lab identity; only the Lab launcher's runtime `ORCA_LAB_ROOT` selects Lab. Updates are manual; never replace a running installation without approval.

# Useful Commands

- **Validation**: Run the smallest checks that verify the change. Prefer focused tests; expand only for concrete risk, failures, or explicit requests. Shared imports alone don’t justify broad suites.
- **Typecheck**: `pnpm tc` (or `tc:node` / `tc:cli` / `tc:web`)
- **Test**: `pnpm test [path/to/file.test.ts]`; affected only: `pnpm test:changed [path] --maxWorkers=2` ([details](.github/CONTRIBUTING.md#targeting-local-tests))
- **Lint**: `oxlint`; format: `pnpm format`

# Ensure main is always releasable

Never break main. Use stacks or collapse PRs before merge

# Design System

All UI work — layout, color, typography, spacing, component selection, UX behavior — must follow [`docs/STYLEGUIDE.md`](./docs/STYLEGUIDE.md). Use the tokens defined in `src/renderer/src/assets/main.css` (the canonical source) and the shadcn primitives in `src/renderer/src/components/ui/`. Don't invent new color values, font sizes, or shadow tiers when a documented one already covers the role. Read the `docs/styleguide/` deep dive it links only when your change touches that topic. When STYLEGUIDE.md is silent, follow the resolution order in its final section.

# Electron UI Validation

Always run tests and agent-launched apps in the background with `ORCA_BACKGROUND_LAUNCH=1`.
Never steal monitor focus or reveal test windows: no `show()`, `showInactive()`, `bringToFront()`,
`app.focus()`, or OS activation. Use CDP screenshots of hidden renderers. Keep native-focus and visible-window tests paused on the user's desktop; run them on an isolated display or CI.
Rebuild modified launch-policy code before running an app; stale build wrappers are not safe.

Use the `$electron` skill and Playwright CDP for rendered Orca UI checks. Do not use computer-use for Orca UI validation.
Screenshot presentational components without Electron: `pnpm fixtures:shot <id>` ([fixtures](docs/agents-md-refs/component-fixtures.md)).

# Code Style

## Reuse Before Reimplementing

Before writing new logic at any scale — a function, component, IPC channel, state store, or whole subsystem/flow — check whether an existing implementation already does the job. Extend or generalize it instead of building a parallel version.

## Avoid Comments

- Only use when code does not describe
- BE CONCISE. 1 LINE if possible (why not how)

## File and Module Naming

Never use vague names like `helpers`, `utils`, `common`, `misc`, or `shared-stuff` for files, folders, or modules. They carry zero info and tend to become dumping grounds. Name files after what they _actually_ contain — prefer the concrete domain concept (e.g. `tab-group-state.ts`, `terminal-orphan-cleanup.ts`) over the generic role (`tabs-helpers.ts`, `terminal-utils.ts`). If you find yourself reaching for `helpers`, the file probably has more than one responsibility and should be split, or there's a better name hiding in the code that describes what the functions operate on.

## Type Assertions: Prefer Checked Types

Avoid type assertions except `as const`. Unavoidable casts need a line-specific `SAFETY:` explanation:

# First Class Citizens

Every change must consider these areas:

## Cross-Platform Support

Support macOS, Linux, and Windows. Guard platform-specific behavior at runtime; use platform-aware shortcuts, paths, and existing process wrappers. Before changing platform-specific code, processes, shells, shortcuts, paths, or native modules, read [`docs/agents-md-refs/cross-platform-support.md`](./docs/agents-md-refs/cross-platform-support.md).

## Remote Use Case

Support remote execution as well as local. Clients and servers update independently; preserve compatibility across mixed versions.

## Mobile

Any feature should be considered for parity on mobile

## Folder Workspaces

All changes must consider folder workspaces as well as git worktrees. Don't assume every workspace is a git worktree.

# Git / GitHub

If changing code around `git`, `gh`, source-control, or review behavior read [`docs/agents-md-refs/git-workflow.md`](./docs/agents-md-refs/git-workflow.md).

For a failed GitHub Actions run, inspect the failed jobs and retry with `gh run rerun <run-id> --failed --repo stablyai/orca`. Preserve successful jobs; use a full rerun only when the failure requires revalidating them. A code fix needs a new push and fresh checks, not a retry of the old SHA.

# Tests

Avoid adding low-value tests. These might be fine for development but offer negative value when checked in. [Anti-patterns](./docs/agents-md-refs/test-antipatterns.md)
