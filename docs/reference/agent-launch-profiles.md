# Agent launch profiles

Agent settings register named Pi and Claude profiles with a display name, a concrete
command, an absolute local account directory, and an optional `~/`-relative remote
directory. Credentials stay in those directories and are never persisted in
settings. A profile exports its agent's account variables: `PI_CODING_AGENT_DIR` and
`ORCA_PI_SOURCE_AGENT_DIR` for Pi, `CLAUDE_CONFIG_DIR` plus the
`ORCA_CLAUDE_LAUNCH_PROFILE` marker for Claude. On Windows, POSIX wrapper commands
require a compatible configured shell such as Git Bash.

Keep the built-in default as `pi` or `claude` and add one profile per extra account
(for example `piw` or `ccw`); do not duplicate the default account. Leave the implicit
default config directory unpinned: exporting `CLAUDE_CONFIG_DIR` even for `~/.claude`
changes its OAuth Keychain identity. Local-native targets offer every profile. SSH
targets offer only profiles with a remote directory, resolved against the home the
host reported, so a remote launch never receives a local path. Retained SSH state
admission must preserve the optional, bounded `remoteHomeDirectory` through preload
and authority reconciliation; omit invalid or oversized paths rather than truncating
them. Without that metadata profiles remain unavailable. WSL, paired runtime, and
ephemeral-VM targets offer none. Tab launch menus, quick launch, and new worktree or
folder creation share this scoping; a pending linked creation is reused only when its
captured command and account root match the selection.

Launches snapshot the concrete command and account variables; cold restore and
sleeping-agent wake replay that snapshot rather than the current default. Local-native
resume compares lexical transcript boundaries against the account roots and refuses
an ambiguous or conflicting owner instead of falling back to another account; remote,
WSL, and paired snapshots are never interpreted with local roots. Session history
pins local Pi and Claude transcripts to the profile that owns them when that agent
has profiles configured.

Automations may pin a profile by id. Dispatch resolves it from the dispatching desktop
client's settings and fails the run when the profile is deleted or cannot launch on
the workspace host; session reuse requires the same account root. Headless and
paired-server dispatch refuse pinned automations. Model and effort come from the
automation's extra agent arguments.

Claude hook installation covers configured local profile roots and is reconciled when
profiles are saved; remote profile roots are not hooked. Pi's relay spawn preparation
installs its status extension directly into the selected account root.

## Validation and deployment

A desktop test requires disposable user data **and** disposable agent homes. The
E2E home helper does not remove every inherited agent-directory variable; explicitly
isolate Pi/OMP/Prime directories and hook endpoints as well as the test home.
Packaged Lab GUI probes use the Lab environment builder and explicit account roots;
preserve Windows known-folder variables so Electron can resolve `appData`.
Always set `ORCA_BACKGROUND_LAUNCH=1`. Never reuse a live transcript for a
disposable-session test.

An unpacked build is preferable to installer validation on a working desktop. An
alternate installer directory does not isolate Windows registration or shortcuts.
Read the Windows daemon-host relocation in `src/main/daemon/daemon-host-relocation.ts`
before packaging or cutover. Closing the running app or replacing its installation requires
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
