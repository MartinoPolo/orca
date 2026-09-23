# Session Attention — Design Brief

Session attention makes a specific agent session easy to find without changing workspace-tree order. It extends existing compact workspace rows and Activity while keeping factual status, unread acknowledgement, saved-for-later state, and priority independent.

**Source**: [MartinoPolo/orca issue #5](https://github.com/MartinoPolo/orca/issues/5)

---

## 1. Purpose

Developers running several sessions in one workspace need to answer: “Which exact session needs me?” and “What should I handle next?” Workspace rows provide location; Activity provides the ordered queue.

- **Status** is an execution fact.
- **Unread** is an acknowledgement fact.
- **Saved** is a durable user marker.
- **Priority** is a user-assigned queue rank.

The design must make these signals easy to scan without conflating them.

---

## 2. Proposal

### Product surfaces

- **Workspace body — existing structure, proposed row states:** workspace cards retain source order. Existing 24px compact agent rows gain a factual state glyph, state/attention background, unread dot and optional outline, priority badge, saved marker, and shared context menu.
- **Activity body — existing structure, proposed queue logic:** Attention/All scopes sit above the current grouped thread list. Group order stays factual and priority/age only sort within a group.
- **Workbench and app chrome — context only:** titlebar, terminal, tabs, status bar, workspace-card architecture, sidebar resize behavior, and bottom toolbar are not redesigned.

### Signal grammar

> **Background = state · Outline/dot = unread · Badge = priority · Bookmark = saved**

- The background uses the factual status family when the session has an existing attention reason.
- A contrasting orange full-perimeter outline and the accessible orange dot mean unread across every factual state. The unread treatment never adopts a status hue.
- Priority and saved colors remain independent from the state palette.
- Keyboard focus is an external focus-visible ring with a separate neutral color, not the inset orange unread outline.

### Attention-style comparison — mockup only

The same fixture data can be viewed with two static treatments. Neither changes eligibility, ordering, dimensions, saved markers, hover, current, or focus behavior.

1. **Strong tint:** retained only as a prototype comparison alternative; unread remains visible through its orange dot.
2. **Tint + unread outline — implementation baseline:** a conspicuous but unsaturated status surface plus an orange inset outline on every unread session, regardless of status.

The approved direction is static: no attention motion, breathing effect, or animation control.

---

## 3. Palette Direction

**A · Red / violet is the implementation baseline.** It is the current default selected through general approval of the latest prototype, not a claimed explicit palette vote. B · Red / blue and C · Red / dark yellow remain prototype-only comparison alternatives; this does not create a production palette setting requirement. Palette changes in the mockup affect only session status glyphs and attention surfaces, not app chrome, focus, priority, or saved markers.

| Option                    | Waiting / permission | Blocked / interrupted / failed |
| ------------------------- | -------------------- | ------------------------------ |
| **A · Red / violet**      | vivid red            | violet                         |
| **B · Red / blue**        | red                  | blue                           |
| **C · Red / dark yellow** | red                  | dark mustard/yellow            |

`Blocked` is a factual provider state, not a synonym for failure; providers may use it for questions. The second family groups blocked, interrupted, and authoritative failed for visual comparison without renaming those states.

### Candidate values

Each entry is `foreground / border reference / surface`. Border references support status components but are not used as a status-colored row outline.

| Option / theme | Waiting and permission        | Blocked, interrupted, failed  |
| -------------- | ----------------------------- | ----------------------------- |
| A light        | `#B42318 / #D92D20 / #FDE8E7` | `#6D28D9 / #7C3AED / #F0E9FF` |
| A dark         | `#FF9B94 / #FF6B63 / #4A2726` | `#C4B5FD / #A78BFA / #45345F` |
| B light        | `#B42318 / #D92D20 / #FDE8E7` | `#1D4ED8 / #2563EB / #E8F1FF` |
| B dark         | `#FF9B94 / #FF6B63 / #4A2726` | `#93C5FD / #60A5FA / #1B2B45` |
| C light        | `#B42318 / #D92D20 / #FDE8E7` | `#713F12 / #A16207 / #F5E7B0` |
| C dark         | `#FF9B94 / #FF6B63 / #4A2726` | `#F6C453 / #D6A82C / #57451B` |

The unread outline/dot is `#B54708` in light theme and `#FFB454` in dark theme for every palette.

Other factual states stay stable across candidates:

- Working and monitoring: existing yellow family.
- Done: green.
- No recent update: amber dashed glyph, visually distinct from every waiting candidate.
- Idle: neutral.

Surfaces are strong enough to notice but remain low-saturation row tints rather than full-color fills. Foregrounds and surfaces are tuned separately for light and dark themes.

---

## 4. Requirements

### 4.1 Independent signals and acknowledgement

- Retain the exact `AgentStateDot` vocabulary: Waiting for input, Blocked, Needs attention (permission), Interrupted, Working, Monitoring background tasks, No recent update (unverifiable), Failed, Done, and Idle.
- Do not infer success from `done`; display “Done,” not “Succeeded.”
- Do not infer failure from blocked, prose, or missing remote contact. Explicit failure requires authoritative status data.
- Missing remote contact is “No recent update,” never completion, interruption, or failure, and alone adds neither a tint nor Attention eligibility.
- Unread can apply to any factual status. Its orange outline and dot encode acknowledgement independently from status hue.
- Opening the exact session, clicking “Unread — mark read: {session name},” or choosing Mark read clears unread only.
- Reading a waiting, blocked, or permission session removes the unread outline/dot but keeps its unresolved status background and Attention eligibility.
- Reading Done removes its unread outline and Done tint unless another existing qualifying reason remains.
- Reading an explicit authoritative failure clears unread but does not rewrite or hide the factual failure treatment.
- Saved-for-later survives read, status change, new turns, restart, and supported resume; only Remove saved marker clears it.

### 4.2 Workspace rows

- Extend the existing 24px `CompactAgentRow`; do not add cards inside workspace cards.
- Put status at the leading edge, truncated session text in the flexible center, and unread, priority, and saved controls in a fixed trailing slot.
- Apply a status background only for unresolved waiting/blocked/permission, authoritative failure, or unread completion/interruption.
- Saved-only rows use only the bookmark. Working, idle, read Done, and unverifiable rows have no attention background.
- Preserve hover and current-pane fill. Current treatment may replace the status background while glyph, unread dot/outline, priority, and bookmark remain legible.
- The focus-visible ring sits outside the row and remains distinguishable from the inset unread outline.
- Workspace aggregate attention may remain on the header but cannot replace per-session treatment.
- New attention and priority changes never reorder workspace/project rows or move focus.

### 4.3 Activity queue

- **Attention** includes read unresolved waiting/blocked/permission, authoritative failures, unread completion/interruption, and saved sessions.
- **All** preserves access to every activity session, including unread statuses that do not independently qualify for Attention.

#### Sorting

- Preserve status-group order: waiting, blocked, permission, interrupted, working, monitoring, unverifiable, failed, done, idle.
- Within each group sort by priority descending (P5 → P1), then unread first, then outstanding `attentionAgeMinutes` descending (older episodes first), then deterministic session identity.
- Unread wins over age only at equal priority: a younger unread session precedes an older read session, while a read higher-priority session still precedes an unread lower-priority session.
- Repeated reports and reconnect delivery do not reset age. Priority never crosses status-group order.
- The empty state reads “No sessions need attention” and offers All without implying success.

### 4.4 Priority

- P1 is solid blue, P2 solid green, P4 solid orange, and P5 solid red. P3 remains hidden on rows and neutral inside controls. Done remains green and distinct from every priority badge.
- Badges have a fixed compact footprint in Workspace and Activity views.
- Text contrast is chosen per fill. Orange uses dark text rather than assuming white passes.
- Priority colors do not change with the state-palette control.

### 4.5 Context menu and keyboard

- Workspace and Activity rows reuse the same `ContextMenu` actions.
- Priority opens a radio submenu ordered P5, P4, P3 Default, P2, P1.
- Saved marker opens a radio-style color submenu plus Remove saved marker when set.
- The final item is Mark read or Mark unread based on acknowledgement state.
- Right click and Shift+F10/Menu open the menu. Arrow keys traverse, Right opens a submenu, Left returns, Enter/Space selects, and Escape closes.
- Every close or selection restores focus to the invoking row. Updating read removes the outline immediately but does not clear an unresolved background.
- Selection updates the row and Activity order without activating another session.

### 4.6 Persistence and identity

- Persist priority and saved marker by session-scoped identity, not pane identity.
- Support terminal and structured sessions, folders, worktrees, and remote sessions within current compatibility boundaries.
- Child-agent rows without independent panes retain parent navigation and do not become duplicate queue subjects.

---

## 5. State Matrix

| State                     | Background                                | Unread treatment                             | Other signals                        |
| ------------------------- | ----------------------------------------- | -------------------------------------------- | ------------------------------------ |
| Unread waiting/permission | input-family surface                      | orange outline + dot                         | factual glyph/label                  |
| Read waiting/permission   | input-family surface remains              | none                                         | factual glyph/label                  |
| Unread blocked            | blocked/outcome-family surface            | orange outline + dot                         | Blocked label; never renamed failure |
| Read blocked              | blocked/outcome-family surface remains    | none                                         | factual glyph/label                  |
| Authoritative failure     | outcome-family surface remains after read | orange outline + dot only while unread       | Failed label                         |
| Unread interruption       | outcome-family surface                    | orange outline + dot                         | Interrupted label                    |
| Read interruption         | none unless another reason qualifies      | none                                         | Interrupted label remains            |
| Unread Done               | green surface                             | orange outline + dot                         | Done label                           |
| Read Done                 | none unless another reason qualifies      | none                                         | Done label remains                   |
| Unverifiable              | none                                      | orange outline + dot if independently unread | dashed amber glyph                   |
| Working / monitoring      | none                                      | orange outline + dot if independently unread | yellow factual glyph                 |
| Saved                     | no background by itself                   | independent                                  | colored bookmark                     |
| Priority                  | no background by itself                   | independent                                  | solid compact badge                  |
| Keyboard focus            | unchanged                                 | external focus ring                          | never encoded as unread              |

---

## 6. Layout and Fixtures

- Sidebar default width is 280px; production bounds remain 220–500px.
- Workspace rows stay 24px high with 11px text and a 66px fixed trailing slot.
- Flexible titles use `min-width: 0` and truncate before markers. Menus portal outside sidebar clipping.
- Activity rows retain 13px title/status text and 11px metadata; optional metadata yields before status, unread, priority, or saved markers.
- The prototype includes equal-priority Waiting fixtures where a younger unread row precedes an older read row, plus an unread lower-priority Waiting fixture that remains below the read higher-priority row. It also includes blocked/provider-question, permission, interrupted, authoritative failed, unread Done, and amber dashed No recent update fixtures.
- The narrow 220px state must not clip unread, priority, or bookmark markers.

---

## 7. Component Reuse

Use existing `CompactAgentRow`, `ActivityThreadRow`, `AgentStateDot`, ghost icon `Button`, `Badge`, Radix-backed `ContextMenu` primitives, `Tooltip`, and Lucide icons.

Proposed production responsibilities:

- `SessionPriorityBadge`: fixed-width P1/P2/P4/P5 badge; P3 omitted.
- `SessionSavedMarker`: bookmark plus accessible color name.
- `SessionAttentionSurface`: shared eligibility and visual signal grammar.
- `SessionAttentionContextMenu`: shared priority, saved, and read actions.

No new headless primitives are needed.

---

## 8. Mockup Controls

All controls are outside the product frame and are not production proposals. Production uses the Tint + unread outline and A · Red / violet baselines; it does not require style or palette settings.

- View: Workspaces / Activity.
- Attention style comparison: Strong tint / Tint + unread outline.
- State palette comparison: A · Red / violet / B · Red / blue / C · Red / dark yellow.
- Theme: light/dark.
- Reset: restores palette A and Tint + unread outline.

The prototype has no attention-animation control.

---

## 9. Accessibility and Constraints

- Color is never the sole signal: status glyph/label, unread dot/name, `P#` text, bookmark icon/color name, and menu labels remain available.
- Meet WCAG AA for text and visible keyboard focus in both themes.
- Keep hover, current, unread, and focus layers distinguishable.
- Do not reorder the workspace tree, infer state from prose, or turn remote uncertainty into an outcome.
- Preserve the 220px minimum and long/localized names without displacing markers.
- Do not recolor app chrome or priority with the experimental state palettes.
- No new top-level sidebar section or replacement notification system.

---

## 10. References

- `src/renderer/src/components/sidebar/worktree-card-compact-agent-row.tsx`
- `src/renderer/src/components/activity/activity-thread-row.tsx`
- `src/renderer/src/components/AgentStateDot.tsx`
- `src/renderer/src/components/sidebar/SidebarHeader.tsx`
- `src/renderer/src/components/ui/context-menu.tsx`
- `src/renderer/src/assets/main.css`
- `designs/session-attention/variants/variant-a.html`

---

## 11. Excluded

- Production React, state, persistence, IPC, notification, token, or test implementation.
- Production attention-style or state-palette settings; prototype alternatives remain comparison aids only.
- Priority-based project/workspace ordering or cross-status priority override.
- Notification frequency/cooldown changes.
- Automatic prose analysis or new execution-status producers.
- Cross-device synchronization.
- Redesign of app chrome, terminal, workspace cards, or Activity architecture.
