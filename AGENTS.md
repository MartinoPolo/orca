# Fork

`main` is the maintained `MartinoPolo/orca` fork branch: it carries local reliability patches on top of [`stablyai/orca`](https://github.com/stablyai/orca) and is the source for the installed Orca app. Preserve these patches when syncing upstream.

## Fork Patches

- **Implemented:** `ORCA_MANUAL_UPDATES_ONLY=1` disables automatic updates and publishing for custom builds without weakening signature checks. Fork manual packages require a clean local `main` matching freshly fetched `fork/main` and an `out/fork-build-source.json` proof of the compiled output; pending development refs are recorded but excluded. `pnpm run build:fork:installer` writes a provenance-stamped Windows x64 NSIS installer under `MPX_APPS/Orca-Stable`.
- **Implemented:** Exclude private `notes/` deployment evidence and previous `dist/` builds from packages, including when packaging to an alternate output directory.
- **Implemented:** Require the pinned pnpm directly so self-downloading wrappers cannot rewrite the environment lockfile.
- **Implemented:** Keep verification portable with discovered Git Bash executables, platform-correct fixtures, and Git-compatible patch diff paths; native Windows builds accept the two-part developer-environment version that VS 2026 Build Tools report. Packaged CLI smoke checks use the shared bounded, hidden process runner.
- **Implemented:** Refresh Cursor's chat metadata index on a cached miss so newly created chats are found even when workspace directory timestamps do not change; coalesce refreshes per scan and preserve WSL refusal recovery.
- **Implemented:** Send Pi's Ctrl+Enter as CSI-u from trusted panes without enabling the protocol globally for Windows ConPTY shells.
- **Implemented:** Preserve negotiated Alt shortcuts through the application-owned Kitty mode mirror, clear stale mouse modes before snapshots re-arm the source's tracking, probe desktop wheel-to-arrow fallbacks, and prevent unencodable mobile wheel reports from becoming editor arrow keys; see [`docs/reference/terminal-input-mode-preservation.md`](docs/reference/terminal-input-mode-preservation.md).
- **Implemented:** Windows desktop port discovery uses unfiltered `netstat` enumeration so IPv4 and IPv6 TCP listeners reach the existing scanner and workspace attribution. Parsing still requires the English `LISTENING` state.
- **Implemented:** Per-agent linked work-item prompt templates can prefill issue and review workspaces with workflows such as `/skill:mpx-execute {{artifact_url}}` while keeping launch drafts reviewable.
- **Implemented:** Named Pi and Claude profiles capture a concrete command and account root for launch, workspace creation, and account-aware resume (cold restore, sleeping-agent wake, and session history); a profile's `CLAUDE_CONFIG_DIR` wins over upstream managed-account routing. An optional home-relative remote root enables SSH profiles without sending local account paths to the host; WSL and paired targets remain excluded. See [`docs/reference/agent-launch-profiles.md`](docs/reference/agent-launch-profiles.md).
- **Implemented:** Automations can pin a named launch profile (account); model and effort use upstream's per-automation extra agent arguments. Main-process dispatch resolves the profile from desktop settings and fails the run when it is deleted, the surface is chat, or the workspace is not local (SSH, WSL), never falling back to another account; session reuse requires the same account, and headless, `--serve`, or paired-server hosts refuse pinned automations.
- **Implemented:** Orchestration workers run on the coordinator's launch profile when they run the same agent; `worker-start --launch-profile <name|default>` overrides it. Profile workers start in a local-native terminal, never a chat.
- **Implemented:** A repository can pin a Claude or Pi profile as its text generation account; local commit message and pull request generation with that agent runs under it and fails rather than switching accounts when the profile is gone.
- **Implemented:** Source control starts “Committed on Branch” collapsed on panel mount and workspace switches; committed files and their header use muted styling on a secondary surface, separated from visible active changes by a gap and divider.
- **Implemented:** Source control offers Amend Last Commit while HEAD is unpushed and Amend & Force Push (with lease) once it is published, blocked while the branch is behind; an empty message keeps the existing one. Automatic amend pushes capture HEAD and the destination before amendment and use a dedicated `git.pushWithLease` method with that explicit OID; missing leases or unsupported hosts stop after the local amend, never fall back to a bare lease. `git.amendCommit` remains separate so older hosts refuse it instead of creating a new commit; SSH worktrees reach both through the remote Orca runtime.
- **Implemented:** Add bindable directional tab moves (`tab.moveToPane{Left,Right,Up,Down}`, distinct from upstream's in-strip `tab.moveLeft`/`tab.moveRight` reorder) that merge into direct neighboring tab groups or create splits, including from editors, floating terminals, and focused browser pages. Move-to-pane-right takes `Mod+Alt+ArrowRight` (`Ctrl+Alt+Right` on Windows and Linux) from upstream's worktree history forward, which ships unbound.
- **Implemented:** Add session-scoped attention metadata, priority, saved markers, and per-session sidebar/Activity treatments without changing execution-status authority or workspace-tree order; session rows open their own context menu inside workspace cards, and Activity rows extend upstream's thread menu and show their project icon. Activity status grouping splits into High priority (effective priority >= 4) and Other, each ordered by a fixed state order, then effective priority, unread, and age. Effective priority is the stored priority (default P3) shifted +1.5 for work projects (per-repo flag, preset from a Work folder) while the persisted Activity Work switch is on and -1.5 while off.
- **Implemented:** Agent alerts offer separate done, input, and blocked/failure sounds for terminal and structured sessions through the shared attention delivery module, honoring machine mutes; desktop agent banners require effective (Work-shifted) priority >= 4 (unprioritized alerts count as P3), while priority does not govern in-app attention or mobile fan-out. Runtime graph publication loads notification dispatch only after a qualifying failure transition to avoid a store initialization cycle.
- **Implemented:** Upstream announces a Claude turn held open by background work at once; the fork's Claude listener stamps `turnCompletedAt` only on failed held turns, so a turn that ends while subagents, shells, monitors, or session crons are in flight raises no Done banner, sound, or phone push until the work drains. Needs-input and failed turns still alert at once.
- **Implemented:** Alert tracing: every delivered agent alert records an `agent_attention_delivered` renderer breadcrumb (pane, agent, sound category, state, outcome), and a pane whose hooks switch provider sessions records `agent_hook_session_switch`, both in `logs/main.trace.ndjson`, so an unexpected sound can be traced to its pane and to nested agents (for example `claude -p` run from a pane's tool shell) reporting under the pane.
- **Implemented:** The sidebar agent row matching the focused terminal pane carries a blue `--terminal-pane-locate` outline over attention surfaces, so switching tabs shows which agent is in view; non-agent terminals highlight nothing.
- **Implemented:** Sidebar agent lists start expanded; compact lists offer a collapse row only above three top-level agents. Explicit collapse choices survive sidebar remounts within the renderer session.
- **Implemented:** Terminal tab headers mark launch identity (Pi blue for every account, Claude orange, command launches green) with a bottom strip, softened on inactive tabs; only the active tab fills with its identity tint. Unread (yellow) and attention (red: needs input, interrupted, or failed) fill any tab, so a filled inactive tab always needs the user. Manual swatches, Automatic, and No color choices remain; ordinary terminals stay neutral, and command provenance persists as an optional `launchKind` layout creation fact.
- **Implemented:** Terminal and chat file links route by kind: text stays in Orca's editor, while images, PDFs, audio/video, and other binary files open with the OS default app (downloaded first over SSH). Each kind is configurable under Settings → Browser → Terminal link clicks; Shift+Cmd/Ctrl-click and the popover's primary row follow the per-kind default.
- **Implemented:** `terminal list` (and its RPC) reports each terminal's optional `agentSession` (`{ id, transcriptPath? }`): the hook-reported session of the pane's published `agentIdentity` agent, absent when unknown or reported by another agent, so local tools can address a specific agent session's terminal. Mobile already receives the same session through `session.tabs` agent status and needs no change.

Add or update a one-to-three-sentence entry here for every fork-only patch.

## Installation

Run `pnpm run build:fork:installer` from a clean, published fork `main`, validate its unpacked build with isolated data in background mode, then stop Orca, back up its installation/profile/registry, and run the installer. Windows keeps a taskbar tray registration per executable path, so afterwards run `pnpm run prune:tray` to drop registrations of every Orca executable other than the installed app, and delete superseded `MPX_APPS/Orca-Stable` build and log directories. Updates are manual; never replace a running installation without approval.

# Checks

- **Gate**: `pnpm check:changed` runs format, lint, typecheck, the tests that import your changes, and the ratchets your paths select, and prints only failures. Run it once when you are done editing (and again after a rebase or fix), then push. A pass is cached, so don't rerun it "to be sure", and don't also run `pnpm tc`, `pnpm lint`, or the full suite. Never `--no-verify`.
- **While iterating**: run only what you touched: `pnpm test <file.test.ts> --maxWorkers=2`, `pnpm tc:node|tc:web|tc:cli`, `pnpm exec oxlint <files>`, `pnpm exec oxfmt --write <files>`. Transitive tests and the full suite are CI's job ([details](.github/CONTRIBUTING.md#targeting-local-tests)).
- Run checks in the foreground with `timeout 900`. Don't background them and poll with `sleep`.
- Stacked PRs: `ORCA_CODE_QUALITY_BASE=<ref>` or `--base=<ref>`; `--base=HEAD` covers only uncommitted edits.
- CI: `gh pr checks --watch` or `gh run watch <id> --compact --exit-status` (no polling). Read failures with `gh run view <id> --log-failed`; for long logs, filter with `grep -nE "error|FAIL|✗"` instead of tailing.

# Repo Rules

- Ensure main is always releasable
- Never break the CI. If it's broken, merge fixes.
- **Do not add tests by default.** Low-value tests cost more than they catch. Add one only when it fails if your change is reverted, hardcodes its expected values (never computed by production code, locale files, or mocks), and runs at the single layer that owns the behavior. Never test copy/translations, CSS classes, constants, third-party libraries, private state, timing, or work counts. If you touch a test like that, delete it instead of updating it. One exception: a perf contract in a `*.performance.test.{ts,tsx,mjs}` file may count work ([rules](./docs/agents-md-refs/test-antipatterns.md#perf-contracts)). If not convinced see [anti-patterns](./docs/agents-md-refs/test-antipatterns.md).

# Design System

All UI work — layout, color, typography, spacing, component selection, UX behavior — must follow [`docs/STYLEGUIDE.md`](./docs/STYLEGUIDE.md). Use the tokens defined in `src/renderer/src/assets/main.css` (the canonical source) and the shadcn primitives in `src/renderer/src/components/ui/`. Don't invent new color values, font sizes, or shadow tiers when a documented one already covers the role.

# Electron UI Validation

- Always run tests and agent-launched apps in the background with `ORCA_BACKGROUND_LAUNCH=1`.
- Never steal monitor focus or reveal test windows: no `show()`, `showInactive()`, `bringToFront()`, `app.focus()`, or OS activation. Use CDP screenshots of hidden renderers.
- Keep native-focus and visible-window tests paused on the user's desktop; run them on an isolated display or CI.
- Rebuild modified launch-policy code before running an app (stale build wrappers are not safe).
- Use the `$electron` skill and Playwright CDP for rendered Orca UI checks. Do not use computer-use for Orca UI validation.
- Rendered UI E2E checks need an explicit, reproducible viewport and state.
- Screenshot presentational components without Electron: `pnpm fixtures:shot <id>` ([fixtures](docs/agents-md-refs/component-fixtures.md)).

# Code Style

## Reuse Before Reimplementing

Before writing new logic at any scale extend or generalize it instead of building a parallel version.

## Avoid Comments

- Only use when code does not describe
- BE CONCISE. 1 LINE if possible (why not how)

## File and Module Naming

Never use vague names like `helpers`, `utils`, `common`, `misc`, or `shared-stuff` for files, folders, or modules. They carry zero info and tend to become dumping grounds. Name files after what they _actually_ contain — prefer the concrete domain concept (e.g. `tab-group-state.ts`, `terminal-orphan-cleanup.ts`) over the generic role (`tabs-helpers.ts`, `terminal-utils.ts`). If you find yourself reaching for `helpers`, the file probably has more than one responsibility and should be split, or there's a better name hiding in the code that describes what the functions operate on.

# First Class Citizens

Every change must consider these areas:

1. Cross-Platform Support (mac/linux/windows)
   - Guard platform-specific behavior at runtime; use platform-aware shortcuts, paths, and existing process wrappers. Before changing platform-specific code, processes, shells, shortcuts, paths, or native modules, read [`docs/agents-md-refs/cross-platform-support.md`](./docs/agents-md-refs/cross-platform-support.md).
2. Remote hosts
   - Features should work locally and on remote hosts
3. Mobile
4. Folder Workspaces
   - Don't assume every workspace is a git worktree.

# Footguns

## Git / GitHub

If changing code around `git`, `gh`, source-control, or review behavior read [`docs/agents-md-refs/git-workflow.md`](./docs/agents-md-refs/git-workflow.md).
