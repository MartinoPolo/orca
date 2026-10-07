import {
  collectDescendantsFromIndex,
  getProcessTableIndex,
  type ProcessTableIndexOf
} from '../../shared/process-table-index'
import {
  readWindowsProcessIdentityTableFresh,
  readWindowsProcessTable,
  readWindowsProcessTableFresh,
  resetWindowsProcessTableForTests,
  type WindowsProcessIdentityRow,
  type WindowsProcessRow as NativeWindowsProcessRow
} from '../windows/windows-process-table'

export type WindowsProcessRow = {
  pid: number
  ppid: number
  name: string
  command: string
}

export type WindowsProcessCandidate = WindowsProcessRow & { depth: number }

function toProcessRow(row: NativeWindowsProcessRow): WindowsProcessRow {
  return {
    pid: row.pid,
    ppid: row.ppid,
    name: row.name,
    // Why fall back to the image name: a process that denied a query handle has
    // no command line, and callers match on `command` first.
    command: row.command || row.name
  }
}

/**
 * One projection per snapshot identity, mirroring `getProcessTableIndex`.
 *
 * The TTL cache already gives every pane the same native rows array; without
 * this each of them still rebuilt ~1050 row objects, which also handed
 * `getProcessTableIndex` a new array each time and defeated its memo by
 * construction. Keyed weakly, so a projection dies with its snapshot. Rows are
 * shared, never mutated: descendants are copied with their depth, and
 * `anchorRow` is read-only to every caller.
 */
const projectedRows = new WeakMap<readonly NativeWindowsProcessRow[], WindowsProcessRow[]>()

function projectProcessRows(native: readonly NativeWindowsProcessRow[]): WindowsProcessRow[] {
  const cached = projectedRows.get(native)
  if (cached) {
    return cached
  }
  const rows = native.map(toProcessRow)
  projectedRows.set(native, rows)
  return rows
}

/**
 * Rows from a scan that starts after this call.
 *
 * PID-identity checks in teardown must not reuse a cached row — it can predate
 * the very recycle it is meant to detect. Rejects when the table is unreadable,
 * so "unavailable" stays distinguishable from "nothing is running".
 *
 * `readonly` because the projection is shared with every other reader of the
 * same snapshot.
 */
export async function queryWindowsProcessRowsFresh(): Promise<readonly WindowsProcessRow[]> {
  return projectProcessRows(await readWindowsProcessTableFresh())
}

/**
 * The same fresh scan for an ancestry walk, which reads only pid/ppid.
 *
 * Returns identity rows so the command line is not merely unused but absent:
 * asking for it costs an `OpenProcess` per process on the box.
 */
export async function queryWindowsProcessLinksFresh(): Promise<WindowsProcessIdentityRow[]> {
  return readWindowsProcessIdentityTableFresh()
}

export async function queryWindowsProcessDescendants(
  rootPid: number,
  options: { fresh?: boolean } = {}
): Promise<WindowsProcessCandidate[] | null> {
  return (await queryWindowsPaneProcessInventory(rootPid, options))?.candidates ?? null
}

export type WindowsPaneProcessInventory = {
  candidates: WindowsProcessCandidate[]
  /**
   * Full-table row for `anchorPid`. From the whole snapshot, not the ppid
   * projection: a pane-job member whose creator exited is orphaned out of the
   * descendant walk yet can still hold a recycled anchor pid.
   */
  anchorRow: WindowsProcessRow | null
}

export async function queryWindowsPaneProcessInventory(
  rootPid: number,
  options: {
    fresh?: boolean
    anchorPid?: number
    /** The pane's job members, which still hold a chain whose creator exited. */
    jobProcessIds?: ReadonlySet<number> | null
  } = {}
): Promise<WindowsPaneProcessInventory | null> {
  let rows: WindowsProcessRow[]
  try {
    const native =
      options.fresh === true
        ? await readWindowsProcessTableFresh()
        : await readWindowsProcessTable()
    rows = projectProcessRows(native)
  } catch {
    return null
  }
  // One index per snapshot, shared by every pane inspecting inside the TTL
  // window: `byPid` answers both lookups that used to be linear scans, and
  // `childrenByPpid` replaces a per-call Map rebuild over the whole table.
  const index = getProcessTableIndex(rows)
  // Why: a snapshot that omitted the PTY root may be stale or permission-
  // filtered; only an observed root can authoritatively have no descendants.
  if (!index.byPid.has(rootPid)) {
    return null
  }
  const descendants = collectDescendantsFromIndex(index, rootPid)
  return {
    candidates: [
      ...descendants,
      ...collectOrphanedJobMembers(index, rootPid, descendants, options.jobProcessIds)
    ].sort((a, b) => b.depth - a.depth),
    anchorRow: options.anchorPid !== undefined ? (index.byPid.get(options.anchorPid) ?? null) : null
  }
}

/**
 * Job members the ppid walk cannot reach, each at its depth within the orphaned chain.
 *
 * Why: when MSYS runs a script, the forking process exits and leaves the script's
 * children parented to a dead pid, so an agent launched through a Git Bash wrapper
 * is no descendant of the pane root. The per-PTY job still contains it
 * (docs/reference/windows-msys-job-breakaway.md).
 */
function collectOrphanedJobMembers(
  index: ProcessTableIndexOf<WindowsProcessRow>,
  rootPid: number,
  descendants: readonly WindowsProcessCandidate[],
  jobProcessIds: ReadonlySet<number> | null | undefined
): WindowsProcessCandidate[] {
  if (!jobProcessIds) {
    return []
  }
  const reachedProcessIds = new Set(descendants.map((descendant) => descendant.pid))
  reachedProcessIds.add(rootPid)
  const orphanedRows = new Map<number, WindowsProcessRow>()
  for (const processId of jobProcessIds) {
    const row = index.byPid.get(processId)
    if (row && !reachedProcessIds.has(processId)) {
      orphanedRows.set(processId, row)
    }
  }
  return [...orphanedRows.values()].map((row) => {
    let depth = 1
    const visited = new Set([row.pid])
    let parent = orphanedRows.get(row.ppid)
    while (parent && !visited.has(parent.pid)) {
      visited.add(parent.pid)
      depth += 1
      parent = orphanedRows.get(parent.ppid)
    }
    return { ...row, depth }
  })
}

/**
 * The descendant walk over rows the caller already read.
 *
 * Why exported: a caller that needs a field this module's projection drops —
 * process creation time, for a PID-reuse-safe teardown snapshot — would
 * otherwise read the whole table a second time to get it.
 * Null when the root is absent, which is a stale or filtered snapshot rather
 * than a root with no descendants.
 */
export function windowsDescendantsFromRows<Row extends { pid: number; ppid: number }>(
  rows: Row[],
  rootPid: number
): (Row & { depth: number })[] | null {
  const index = getProcessTableIndex(rows)
  if (!index.byPid.has(rootPid)) {
    return null
  }
  return collectDescendantsFromIndex(index, rootPid).sort((a, b) => b.depth - a.depth)
}

/** Test-only: clear the shared snapshot so one case's rows never serve the next. */
export function resetWindowsProcessRowsSnapshotForTests(): void {
  resetWindowsProcessTableForTests()
}
