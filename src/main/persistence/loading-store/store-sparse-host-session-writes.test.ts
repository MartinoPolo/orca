/**
 * Renderer host slices carry only the fields routed to that host, so a host whose worktrees have no
 * live terminal tabs arrives without `tabsByWorktree`. Drives the real `Store` through the quit path.
 */
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceSessionState } from '../../../shared/workspace-session-state-types'
import { closeTestStores, createSqliteTestStore } from '../../persistence-test-harness'

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpdir(),
    getName: () => 'orca-test',
    getVersion: () => '0.0.0-test',
    isPackaged: false,
    on: () => {},
    whenReady: () => Promise.resolve()
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString()
  },
  ipcMain: { on: () => {}, handle: () => {} },
  BrowserWindow: { getAllWindows: () => [] }
}))

const { Store } = await import('./store')

const HOST_ID = 'ssh:target-1'
const WORKTREE_ID = 'repo-1::/home/user/worktree-a'

const stores: InstanceType<typeof Store>[] = []

afterEach(async () => {
  for (const store of stores.splice(0)) {
    store.freezeWrites()
  }
  await closeTestStores()
})

function createStore(): InstanceType<typeof Store> {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'orca-store-sparse-host-')))
  const store = createSqliteTestStore(Store, { dataFile: join(dir, 'orca-data.json') })
  stores.push(store)
  return store
}

function fencedHostSession(): WorkspaceSessionState {
  return {
    activeRepoId: 'repo-1',
    activeWorktreeId: WORKTREE_ID,
    activeTabId: 'tab-1',
    tabsByWorktree: {
      [WORKTREE_ID]: [
        {
          id: 'tab-1',
          ptyId: null,
          worktreeId: WORKTREE_ID,
          title: 'Terminal 1',
          customTitle: null,
          color: null,
          sortOrder: 0,
          createdAt: 1
        }
      ]
    },
    terminalLayoutsByTabId: {},
    terminalTopologyRevisionByRepoId: { 'repo-1': 1 }
  }
}

/** The shape `splitWorkspaceSessionByHost` emits when only visit recency routes to the host. */
function sparseHostSlice(): WorkspaceSessionState {
  const slice: Partial<WorkspaceSessionState> = {
    activeRepoId: 'repo-1',
    activeWorktreeId: WORKTREE_ID,
    activeTabId: null,
    lastVisitedAtByWorktreeId: { [WORKTREE_ID]: 1 }
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Reproduces the renderer's sparse host slice, which omits the required terminal containers.
  return slice as WorkspaceSessionState
}

describe('Store accepts sparse renderer host slices', () => {
  it('stages a host slice without terminal containers over a fenced partition', () => {
    const store = createStore()
    store.setWorkspaceSession(fencedHostSession(), HOST_ID)

    expect(() => store.stageWorkspaceSessionBeforeUnload(sparseHostSlice(), HOST_ID)).not.toThrow()

    // Why: the topology fence keeps host-authored membership the renderer did not mention.
    const staged = store.getWorkspaceSession(HOST_ID)
    expect(staged.tabsByWorktree[WORKTREE_ID]?.map((tab) => tab.id)).toEqual(['tab-1'])
    expect(staged.lastVisitedAtByWorktreeId).toEqual({ [WORKTREE_ID]: 1 })
  })
})
