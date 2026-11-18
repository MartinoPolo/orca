import { describe, expect, it, vi } from 'vitest'
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
