import { ipcMain } from 'electron'
import { LOCAL_EXECUTION_HOST_ID, type ExecutionHostId } from '../../shared/execution-host'
import type { PersistedUIState } from '../../shared/persisted-ui-state-types'
import { formatShutdownCheckpointFailureReason } from '../../shared/renderer-shutdown-events'
import type { WorkspaceSessionState } from '../../shared/workspace-session-state-types'
import { recordDurableCrashBreadcrumb } from '../crash-reporting/durable-crash-breadcrumb'
import type { Store } from '../persistence'

type StageBeforeUnloadSyncArgs = {
  sessions: { state: WorkspaceSessionState; hostId?: ExecutionHostId }[]
  ui: Partial<PersistedUIState>
}

type StageBeforeUnloadSyncReply = { ok: true } | { ok: false; reason: string }

export type ShutdownCheckpointResult = { ok: boolean }

/** Matches the will-quit teardown budget so a stalled disk can't strand a restart. */
export const SHUTDOWN_CHECKPOINT_FLUSH_DEADLINE_MS = 20_000

function flushStagedStateWithDeadline(store: Store): Promise<ShutdownCheckpointResult> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | null = null
  const deadline = new Promise<ShutdownCheckpointResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      console.error('[app] Timed out persisting staged renderer state')
      resolve({ ok: false })
    }, SHUTDOWN_CHECKPOINT_FLUSH_DEADLINE_MS)
  })
  // Why not drain to stable: Store retries a superseded staged write without
  // chasing unrelated live mutations, which the deadline would otherwise cut off.
  const flush = store
    .flushPendingOrThrowAsync({ signal: controller.signal, drainToStableGeneration: false })
    .then((): ShutdownCheckpointResult => ({ ok: true }))
    .catch((error): ShutdownCheckpointResult => {
      console.error('[app] Failed to persist staged renderer state:', error)
      return { ok: false }
    })
  return Promise.race([flush, deadline]).finally(() => {
    if (timer) {
      clearTimeout(timer)
    }
  })
}

export function registerRendererShutdownCheckpointHandler(store: Store): void {
  // Why: beforeunload cannot await, so the sync reply only reports staging.
  // Durability is joined out-of-band by paths that are about to navigate.
  let pendingCheckpoint: Promise<ShutdownCheckpointResult> = Promise.resolve({ ok: true })

  ipcMain.on('app:stage-before-unload-sync', (event, args: StageBeforeUnloadSyncArgs) => {
    let stage = 'sessions'
    let reply: StageBeforeUnloadSyncReply = { ok: true }
    try {
      for (const { state, hostId } of args.sessions) {
        stage = `session ${hostId ?? LOCAL_EXECUTION_HOST_ID}`
        store.stageWorkspaceSessionBeforeUnload(state, hostId)
      }
      stage = 'ui'
      store.updateUI(args.ui)
    } catch (error) {
      console.error(`[app] Failed to stage renderer state before unload (${stage}):`, error)
      const reason = `${stage}: ${formatShutdownCheckpointFailureReason(error)}`
      // Why: packaged builds discard main stdout, so the stack must reach the durable trace.
      recordDurableCrashBreadcrumb(
        'renderer_shutdown_stage_failed',
        { stage },
        error instanceof Error && error.stack ? error.stack : reason
      )
      reply = { ok: false, reason }
    }
    pendingCheckpoint = reply.ok
      ? flushStagedStateWithDeadline(store)
      : Promise.resolve({ ok: false })
    event.returnValue = reply
  })

  ipcMain.handle(
    'app:await-before-unload-checkpoint',
    (): Promise<ShutdownCheckpointResult> => pendingCheckpoint
  )
}
