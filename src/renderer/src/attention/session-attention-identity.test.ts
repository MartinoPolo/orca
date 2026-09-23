import { describe, expect, it, vi } from 'vitest'
import { buildSessionAttentionIdentity } from '../../../shared/session-attention'
import { makePaneKey } from '../../../shared/stable-pane-id'
import { createTestStore, makeTab } from '@/store/slices/store-test-helpers'
import {
  resolveSessionAttentionIdentity,
  type ResolvedSessionAttentionIdentity
} from './session-attention-identity'

const TERMINAL_TAB = { id: 'terminal-1', ptyId: null }

function resolveProviderIdentity(
  overrides: Partial<Parameters<typeof resolveSessionAttentionIdentity>[0]> = {}
): ResolvedSessionAttentionIdentity | null {
  return resolveSessionAttentionIdentity({
    workspaceId: 'worktree-1',
    agentType: 'codex',
    entry: {
      providerSession: { key: 'session_id', id: 'session-1' }
    },
    terminalTab: TERMINAL_TAB,
    ...overrides
  })
}

describe('resolveSessionAttentionIdentity', () => {
  it('does not resolve a fallback host when the entry has no durable session identity', () => {
    const resolveFallbackExecutionHostId = vi.fn(() => 'runtime:fallback' as const)

    const identity = resolveSessionAttentionIdentity({
      workspaceId: 'worktree-1',
      agentType: 'codex',
      entry: {},
      terminalTab: TERMINAL_TAB,
      resolveFallbackExecutionHostId
    })

    expect(identity).toBeNull()
    expect(resolveFallbackExecutionHostId).not.toHaveBeenCalled()
  })

  it('uses a captured known host without resolving the workspace fallback', () => {
    const resolveFallbackExecutionHostId = vi.fn(() => 'runtime:fallback' as const)

    const identity = resolveProviderIdentity({
      capturedExecutionHostId: 'runtime:known',
      resolveFallbackExecutionHostId
    })

    expect(identity?.executionHostId).toBe('runtime:known')
    expect(identity?.sessionIdentity).toContain('session-1')
    expect(resolveFallbackExecutionHostId).not.toHaveBeenCalled()
  })

  it('resolves the workspace fallback only when durable identity has no host evidence', () => {
    const resolveFallbackExecutionHostId = vi.fn(() => 'ssh:remote' as const)

    const identity = resolveProviderIdentity({ resolveFallbackExecutionHostId })

    expect(identity?.executionHostId).toBe('ssh:remote')
    expect(resolveFallbackExecutionHostId).toHaveBeenCalledTimes(1)
  })

  it('keeps remote connection identity ahead of the workspace fallback', () => {
    const resolveFallbackExecutionHostId = vi.fn(() => 'local' as const)

    const identity = resolveProviderIdentity({
      entry: {
        providerSession: { key: 'session_id', id: 'session-1' },
        connectionId: 'remote target'
      },
      resolveFallbackExecutionHostId
    })

    expect(identity?.executionHostId).toBe('ssh:remote%20target')
    expect(resolveFallbackExecutionHostId).not.toHaveBeenCalled()
  })
})

describe('session attention status reduction', () => {
  it('uses a retained known host without scanning worktrees for a durable entry', () => {
    const store = createTestStore()
    const tab = makeTab({ id: 'terminal-1', worktreeId: 'worktree-1' })
    const paneKey = makePaneKey('terminal-1', '11111111-1111-4111-8111-111111111111')
    const providerSession = { key: 'session_id' as const, id: 'session-1' }
    const getKnownWorktreeById = vi.fn(() => undefined)
    store.setState({
      getKnownWorktreeById,
      tabsByWorktree: { 'worktree-1': [tab] },
      retainedAgentsByPaneKey: {
        [paneKey]: {
          entry: {
            paneKey,
            state: 'done',
            prompt: 'Previous turn',
            updatedAt: 500,
            stateStartedAt: 500,
            stateHistory: [],
            agentType: 'codex',
            worktreeId: 'worktree-1',
            providerSession
          },
          worktreeId: 'worktree-1',
          tab,
          executionHostId: 'runtime:known',
          agentType: 'codex',
          startedAt: 500
        }
      }
    })

    store
      .getState()
      .setAgentStatus(
        paneKey,
        { state: 'waiting', prompt: 'Needs input', agentType: 'codex' },
        'Codex',
        { updatedAt: 1_000, stateStartedAt: 1_000 },
        { tabId: tab.id, worktreeId: 'worktree-1' },
        { providerSession }
      )

    const identity = buildSessionAttentionIdentity({
      executionHostId: 'runtime:known',
      workspaceId: 'worktree-1',
      agentType: 'codex',
      providerSession
    })
    expect(identity).not.toBeNull()
    expect(getKnownWorktreeById).not.toHaveBeenCalled()
    expect(store.getState().sessionAttentionMetadataByIdentity[identity ?? '']).toMatchObject({
      attentionEpisodeStartedAt: 1_000,
      attentionEpisodeKind: 'unresolved-input'
    })
  })
})
