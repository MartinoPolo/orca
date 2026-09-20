import { describe, expect, it, vi } from 'vitest'

import {
  createAgentStatusExtensionHarness,
  type HookContext
} from './agent-status-extension-test-harness'

function sessionContext(sessionId: string, mode: HookContext['mode'] = 'tui') {
  return {
    mode,
    hasUI: mode === 'tui' || mode === 'rpc',
    sessionManager: {
      getSessionId: () => sessionId,
      getSessionFile: () => `/tmp/${sessionId}.jsonl`
    }
  }
}

function postedPayload(fetchMock: ReturnType<typeof vi.fn>, callIndex: number) {
  return JSON.parse(String(fetchMock.mock.calls[callIndex]?.[1]?.body)).payload
}

describe('Pi status activation isolation', () => {
  it('isolates session, prompt, and transport state between same-module activations', async () => {
    let finishParentDelivery: (() => void) | undefined
    const harness = createAgentStatusExtensionHarness({
      kind: 'pi',
      existsSync: () => true,
      fetchImpl: vi.fn(
        () =>
          new Promise((resolve) => {
            if (!finishParentDelivery) {
              finishParentDelivery = () => resolve({ ok: true })
              return
            }
            resolve({ ok: true })
          })
      )
    })
    const child = harness.registerActivation()

    await harness.callHook('session_start', { reason: 'startup' }, sessionContext('parent'))
    await harness.callHook('agent_start', {}, sessionContext('parent'))
    await harness.callHook('ui_prompt_start')
    await child.callHook('session_start', { reason: 'startup' }, sessionContext('child', 'print'))
    await child.callHook('session_shutdown', {}, sessionContext('child', 'print'))
    expect(harness.fetchMock).toHaveBeenCalledTimes(1)

    finishParentDelivery?.()
    await vi.waitFor(() => expect(harness.fetchMock).toHaveBeenCalledTimes(2))
    expect(postedPayload(harness.fetchMock, 1)).toEqual({
      hook_event_name: 'ui_prompt_start',
      session_id: 'parent',
      session_file: '/tmp/parent.jsonl',
      ui_prompt_active: true
    })
  })

  it.each(['pi', 'prime-agent'] as const)(
    'keeps queued %s messages bound to their pre-reload session identity',
    async (kind) => {
      let finishDelivery: (() => void) | undefined
      const harness = createAgentStatusExtensionHarness({
        kind,
        existsSync: () => true,
        fetchImpl: vi.fn(
          () =>
            new Promise((resolve) => {
              if (!finishDelivery) {
                finishDelivery = () => resolve({ ok: true })
                return
              }
              resolve({ ok: true })
            })
        )
      })

      await harness.callHook('agent_start', undefined, sessionContext('before-reload'))
      await harness.callHook(
        'message_end',
        { message: { role: 'assistant', content: 'queued reply' } },
        sessionContext('before-reload')
      )
      await harness.callHook('session_start', { reason: 'reload' }, sessionContext('after-reload'))

      finishDelivery?.()
      await vi.waitFor(() => expect(harness.fetchMock).toHaveBeenCalledTimes(2))
      expect(postedPayload(harness.fetchMock, 1)).toEqual({
        hook_event_name: 'message_end',
        role: 'assistant',
        text: 'queued reply',
        session_id: 'before-reload',
        session_file: '/tmp/before-reload.jsonl'
      })
    }
  )

  it('refreshes a parent event from its own context after another activation changes session', async () => {
    const harness = createAgentStatusExtensionHarness({ kind: 'pi', existsSync: () => true })
    const child = harness.registerActivation()

    await harness.callHook('session_start', { reason: 'startup' }, sessionContext('parent-start'))
    await child.callHook('session_start', { reason: 'startup' }, sessionContext('child', 'print'))
    await harness.callHook(
      'tool_execution_start',
      { toolName: 'read', args: { path: 'parent.ts' } },
      sessionContext('parent-current')
    )

    await vi.waitFor(() => expect(harness.fetchMock).toHaveBeenCalledTimes(2))
    expect(postedPayload(harness.fetchMock, 1)).toMatchObject({
      hook_event_name: 'tool_execution_start',
      session_id: 'parent-current',
      session_file: '/tmp/parent-current.jsonl'
    })
  })
})
