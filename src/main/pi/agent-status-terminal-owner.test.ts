import { describe, expect, it, vi } from 'vitest'
import {
  createAgentStatusExtensionHarness,
  type HookContext
} from './agent-status-extension-test-harness'

function context(sessionId: string, mode: HookContext['mode'] = 'tui'): HookContext {
  return {
    mode,
    hasUI: mode === 'tui' || mode === 'rpc',
    sessionManager: {
      getSessionId: () => sessionId,
      getSessionFile: () => `/sessions/${sessionId}.jsonl`
    }
  }
}

function payloads(harness: ReturnType<typeof createAgentStatusExtensionHarness>) {
  return harness.fetchMock.mock.calls.map(
    ([, options]) => JSON.parse(String(options?.body)).payload
  )
}

const reply = { message: { role: 'assistant', content: 'owner reply' } }

describe('Pi terminal owner admission', () => {
  it('rejects SDK activation before parent startup without claiming the PID', async () => {
    const harness = createAgentStatusExtensionHarness({ kind: 'pi', existsSync: () => true })
    const child = harness.registerActivation()
    await child.callHook('session_start', {}, context('child', 'print'))
    expect(harness.processEnv.ORCA_PI_STATUS_OWNED).toBeUndefined()
    expect(harness.fetchMock).not.toHaveBeenCalled()
    await harness.callHook('session_start', {}, context('parent'))
    expect(payloads(harness)[0].session_id).toBe('parent')
  })

  it('keeps main identity and modal state through concurrent child lifecycles', async () => {
    const harness = createAgentStatusExtensionHarness({ kind: 'pi', existsSync: () => true })
    await harness.callHook('session_start', {}, context('parent'))
    await harness.callHook('agent_start', {}, context('parent'))
    await harness.callHook('ui_prompt_start', {}, context('parent'))
    await vi.waitFor(() => expect(harness.fetchMock).toHaveBeenCalledTimes(2))
    for (const sessionId of ['child-one', 'child-two']) {
      const child = harness.registerActivation()
      const childContext = context(sessionId, 'print')
      for (const event of [
        'session_start',
        'agent_start',
        'ui_prompt_start',
        'agent_end',
        'session_shutdown'
      ]) {
        await child.callHook(event, {}, childContext)
      }
    }
    await harness.callHook('message_end', reply, context('parent'))
    await vi.waitFor(() => expect(harness.fetchMock).toHaveBeenCalledTimes(3))
    expect(payloads(harness).every((payload) => payload.session_id === 'parent')).toBe(true)
    expect(payloads(harness).at(-1)).toMatchObject({ ui_prompt_active: true, text: 'owner reply' })
  })

  it.each([
    ['print', ['-p', 'prompt']],
    ['json', ['--mode', 'json', '-p', 'prompt']],
    ['rpc', ['--mode', 'rpc']]
  ] as const)('keeps a top-level %s owner while excluding SDK children', async (mode, args) => {
    const harness = createAgentStatusExtensionHarness({
      kind: 'pi',
      existsSync: () => true,
      argv: ['node', 'pi', ...args]
    })
    await harness.callHook('session_start', {}, context('parent', mode))
    const child = harness.registerActivation()
    await child.callHook('session_start', {}, context('child', 'print'))
    await child.callHook('session_shutdown', {}, context('child', 'print'))
    await harness.callHook('message_end', reply, context('parent', mode))
    await vi.waitFor(() => expect(harness.fetchMock).toHaveBeenCalledTimes(2))
    expect(payloads(harness).map((payload) => payload.session_id)).toEqual(['parent', 'parent'])
  })

  it('allows headless reload of the same session, but not child reload takeover', async () => {
    const harness = createAgentStatusExtensionHarness({
      kind: 'pi',
      existsSync: () => true,
      argv: ['node', 'pi', '-p']
    })
    const ownerContext = context('parent', 'print')
    await harness.callHook('session_start', {}, ownerContext)
    const child = harness.registerActivation()
    await child.callHook('session_start', { reason: 'reload' }, context('child', 'print'))
    const replacement = harness.registerActivation()
    await replacement.callHook('session_start', { reason: 'reload' }, ownerContext)
    await harness.callHook('message_end', reply, ownerContext)
    await replacement.callHook('message_end', reply, ownerContext)
    await vi.waitFor(() => expect(harness.fetchMock).toHaveBeenCalledTimes(2))
    expect(payloads(harness).map((payload) => payload.session_id)).toEqual(['parent', 'parent'])
  })

  it('allows an explicit RPC session replacement without admitting its SDK child', async () => {
    const harness = createAgentStatusExtensionHarness({
      kind: 'pi',
      existsSync: () => true,
      argv: ['node', 'pi', '--mode', 'rpc']
    })
    await harness.callHook('session_start', {}, context('old', 'rpc'))
    const replacement = harness.registerActivation()
    await replacement.callHook('session_start', { reason: 'switch' }, context('new', 'rpc'))
    const child = harness.registerActivation()
    await child.callHook('session_start', {}, context('child', 'print'))
    await harness.callHook('message_end', reply, context('old', 'rpc'))
    await vi.waitFor(() => expect(harness.fetchMock).toHaveBeenCalledTimes(2))
    expect(payloads(harness).map((payload) => payload.session_id)).toEqual(['old', 'new'])
  })

  it('allows interactive switches and forks without consulting transcript ancestry', async () => {
    const harness = createAgentStatusExtensionHarness({ kind: 'pi', existsSync: () => true })
    for (const sessionId of ['parent', 'switched', 'forked']) {
      await harness.callHook('session_start', { reason: 'switch' }, context(sessionId))
      await vi.waitFor(() => expect(payloads(harness).at(-1)?.session_id).toBe(sessionId))
    }
    expect(payloads(harness).map((payload) => payload.session_id)).toEqual([
      'parent',
      'switched',
      'forked'
    ])
  })

  it('aborts the old request and waits for transport settlement before replacement delivery', async () => {
    const acceptedSessions: string[] = []
    let oldSignal: AbortSignal | null | undefined
    let finishCancellation: (() => void) | undefined
    const harness = createAgentStatusExtensionHarness({
      kind: 'pi',
      existsSync: () => true,
      fetchImpl: async (_url, options) => {
        const sessionId = JSON.parse(String(options?.body)).payload.session_id
        if (sessionId === 'old') {
          oldSignal = options?.signal
          return new Promise((_resolve, reject) => {
            finishCancellation = () => reject(new Error('aborted'))
          })
        }
        acceptedSessions.push(sessionId)
        return { ok: true }
      }
    })
    await harness.callHook('session_start', {}, context('old'))
    const reloaded = harness.registerActivation()
    await reloaded.callHook('session_start', { reason: 'reload' }, context('reloaded'))
    const replacement = harness.registerActivation()
    await replacement.callHook('session_start', {}, context('new'))
    expect(oldSignal?.aborted).toBe(true)
    expect(harness.fetchMock).toHaveBeenCalledTimes(1)
    finishCancellation?.()
    await vi.waitFor(() => expect(acceptedSessions).toEqual(['new']))
    expect(harness.spawnMock).not.toHaveBeenCalled()
  })

  it('retires old pending transport and callbacks only when a replacement claims ownership', async () => {
    let finishDelivery: (() => void) | undefined
    const harness = createAgentStatusExtensionHarness({
      kind: 'pi',
      existsSync: () => true,
      fetchImpl: async () => {
        if (finishDelivery) {
          return { ok: true }
        }
        return new Promise((resolve) => {
          finishDelivery = () => resolve({ ok: true })
        })
      }
    })
    await harness.callHook('session_start', {}, context('old'))
    await harness.callHook('message_end', reply, context('old'))
    const replacement = harness.registerActivation()
    expect(harness.fetchMock).toHaveBeenCalledTimes(1)
    await replacement.callHook('session_start', { reason: 'reload' }, context('new'))
    await harness.callHook('message_end', reply, context('old'))
    finishDelivery?.()
    await replacement.callHook('message_end', reply, context('new'))
    await vi.waitFor(() => expect(harness.fetchMock).toHaveBeenCalledTimes(2))
    expect(payloads(harness).map((payload) => payload.session_id)).toEqual(['old', 'new'])
  })
})
