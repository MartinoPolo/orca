# Orca Lab Isolation

`ORCA_LAB_ROOT` opts a packaged manual-update build into **Orca Lab**. Lab shares the normal development environment but owns a separate Orca profile; development and E2E path overrides are rejected.

## Storage boundary

The launcher preserves `HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, shell initialization, `PATH`, version-manager variables, `MPX_*`, and agent configuration. Only stale process/session routing is removed. Pi, Claude, and other agents use their normal installations, account roots, credentials, extensions, and history; no Lab-home MPX configuration is needed.

Startup requires an absolute, non-symlink Lab root and validates application-storage paths before creating them. Electron `userData` and `sessionData` use `<root>/profile`, including Chromium session storage and cache. `home` and `appData` remain normal. Do not set the undocumented `cache` path: on Windows it aliases `appData`. `ORCA_USER_DATA_PATH` is canonicalized before runtime discovery initializes, so Orca runtime pointers, daemon endpoints, instance locks, and terminal bookkeeping remain profile-local. Windows daemon executable copies remain versioned under normal `LOCALAPPDATA`; they are code, not shared terminal state.

Background verification uses a fresh empty profile and checks actual Electron/session storage paths, the Lab-owned runtime process tree, and unchanged main settings/catalogs. Whole-profile hashes are diagnostic while main is running: its UI and session bookkeeping can change independently.

The Lab name is applied before readiness for a distinct macOS safe-storage identity, and its native main-window title remains **Orca Lab** across renderer loads. Use the isolated launcher and an unpacked build, never the standard installer or a directly opened executable. Launcher and artifact environment contracts must match.

## Preference migration

Read main and Lab's selected profiles independently. Seed normal preferences, including terminal and agent launch settings, into Lab's own state file; never point both applications at one writable database. Existing Lab catalogs and operational state must survive a preferences-only migration. Do not import main's running terminals, active sessions, schedules, cloud identity, connection state, or encrypted account payloads.

Migrate only while Lab's profile writer is stopped, with a backup and concurrent-change checks. A daemon started under the old isolated-home contract must not supply the new environment: stop that Lab runtime only with user approval. Do not delete the former Lab home; it may contain user data.

**Shared development state is intentional, not sandboxed.** Project edits, agent settings, credentials, history, shell configuration, user keybindings, and shared hook installations affect both applications. Shared hook installation locks still coordinate writes to shared agent configuration; they are not Orca instance locks. Avoid opening the same agent session in both applications simultaneously.
