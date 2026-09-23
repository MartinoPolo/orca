import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installApi } from './web-preload-api-test-harness'

describe('web before-unload persistence', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock('./web-runtime-client')
  })

  it('persists final UI and host-partitioned sessions synchronously', async () => {
    const { api, storage } = await installApi('Linux')

    api.app.stageBeforeUnloadSync({
      sessions: [
        { state: { activeWorktreeId: 'local-worktree' } as never },
        {
          state: { activeWorktreeId: 'remote-worktree' } as never,
          hostId: 'runtime:web-env-1'
        }
      ],
      ui: { activeView: 'settings' }
    })

    expect(JSON.parse(storage.getItem('orca.web.workspaceSession.v1') ?? '{}')).toMatchObject({
      activeWorktreeId: 'local-worktree'
    })
    expect(
      JSON.parse(storage.getItem('orca.web.workspaceSession.v1.runtime:web-env-1') ?? '{}')
    ).toMatchObject({ activeWorktreeId: 'remote-worktree' })
    expect(JSON.parse(storage.getItem('orca.web.ui.v1') ?? '{}')).toMatchObject({
      activeView: 'settings'
    })
  })
})
