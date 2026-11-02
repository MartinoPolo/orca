import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParsedAgentStatusPayload } from '../../../shared/agent-status-types'
import { agentMainAgentVerdict } from '../../../shared/agent-main-agent-verdict'
import { createHookListenerState } from '../../../shared/agent-hook-listener/listener-state'
import { normalizeHookPayload } from '../../../shared/agent-hook-listener'
import { makePaneKey } from '../../../shared/stable-pane-id'

const dispatchTerminalNotification = vi.fn()
const dispatchAgentHookTerminalLifecycle = vi.fn()

const HOOK_DONE_QUIET_MS = 1_500
const LEAF_ID = '11111111-1111-4111-8111-111111111111'
const PANE_KEY = makePaneKey('tab-1', LEAF_ID)
const WORKTREE_ID = 'wt-1'
const START = 1_700_000_000_000

type MockStoreState = {
  settings: {
    experimentalTerminalAttention?: boolean
    notifications: {
      enabled: boolean
      agentTaskComplete: boolean
    }
  }
  ptyIdsByTabId: Record<string, string[]>
  suppressedPtyExitIds: Record<string, boolean>
  tabsByWorktree: Record<string, { id: string; ptyId?: string | null }[]>
  terminalLayoutsByTabId: Record<string, unknown>
  agentLaunchConfigByPaneKey: Record<string, unknown>
  agentStatusByPaneKey: Record<string, unknown>
  getAgentLaunchConfigForStatusEntry: () => undefined
}

let mockStoreState: MockStoreState

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => mockStoreState
  }
}))

vi.mock('@/components/terminal-pane/use-notification-dispatch', () => ({
  dispatchTerminalNotification
}))

vi.mock('@/components/terminal-pane/agent-hook-terminal-lifecycle', () => ({
  dispatchAgentHookTerminalLifecycle
}))

type HookRow = ParsedAgentStatusPayload & { stateStartedAt: number }
type HookEvent = { at: number; payload: Record<string, unknown> }
type Alert = {
  at: number
  state: string | undefined
  verdict: string | null
  body: string | undefined
}
type BackgroundTaskKind = 'shell' | 'subagent'
type BackgroundTask = ReturnType<typeof runningTask>

function pinStateStartedAt(
  previous: HookRow | undefined,
  payload: ParsedAgentStatusPayload,
  now: number
): HookRow {
  return {
    ...payload,
    stateStartedAt: previous && previous.state === payload.state ? previous.stateStartedAt : now
  }
}

function runningTask(id: string, kind: BackgroundTaskKind, seconds: number) {
  const description = `Sleep ${seconds} seconds`
  return kind === 'shell'
    ? { id, type: kind, status: 'running', description, command: `sleep ${seconds}` }
    : { id, type: kind, status: 'running', description, agent_type: 'general-purpose' }
}

function subagentStart(task: BackgroundTask, at: number): HookEvent[] {
  return task.type === 'subagent'
    ? [
        {
          at,
          payload: {
            hook_event_name: 'SubagentStart',
            agent_id: task.id,
            agent_type: 'general-purpose'
          }
        }
      ]
    : []
}

function subagentStop(task: BackgroundTask, at: number): HookEvent[] {
  return task.type === 'subagent'
    ? [{ at, payload: { hook_event_name: 'SubagentStop', agent_id: task.id } }]
    : []
}

function taskNotification(task: BackgroundTask): string {
  const summary =
    task.type === 'shell'
      ? `Background command "${task.description}" completed (exit code 0)`
      : `Agent "${task.description}" finished`
  return [
    '<task-notification>',
    `<task-id>${task.id}</task-id>`,
    '<status>completed</status>',
    `<summary>${summary}</summary>`,
    '</task-notification>'
  ].join('\n')
}

/** Claude Code 2.1.309 capture: each background completion wakes the lead for another Stop. */
function twoBackgroundTasksRun(
  longKind: BackgroundTaskKind,
  shortKind: BackgroundTaskKind
): { events: HookEvent[]; finalStopAt: number } {
  const long = runningTask('b3s6e2k21', longKind, 20)
  const short = runningTask('bi5pak0ms', shortKind, 8)
  const finalStopAt = START + 24_000
  const events: HookEvent[] = [
    {
      at: START,
      payload: {
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Run two background Bash commands, reply STARTED, then report each result.'
      }
    },
    ...subagentStart(long, START + 1_000),
    ...subagentStart(short, START + 1_100),
    {
      at: START + 3_000,
      payload: {
        hook_event_name: 'Stop',
        stop_hook_active: false,
        last_assistant_message: 'STARTED',
        background_tasks: [long, short],
        session_crons: []
      }
    },
    ...subagentStop(short, START + 10_900),
    {
      at: START + 11_000,
      payload: { hook_event_name: 'UserPromptSubmit', prompt: taskNotification(short) }
    },
    {
      at: START + 12_000,
      payload: {
        hook_event_name: 'Stop',
        last_assistant_message: 'DONE-8',
        background_tasks: [long],
        session_crons: []
      }
    },
    ...subagentStop(long, START + 22_900),
    {
      at: START + 23_000,
      payload: { hook_event_name: 'UserPromptSubmit', prompt: taskNotification(long) }
    },
    {
      at: finalStopAt,
      payload: {
        hook_event_name: 'Stop',
        last_assistant_message: 'DONE-20',
        background_tasks: [],
        session_crons: []
      }
    }
  ]
  return { events, finalStopAt }
}

function capturedScenario(scenario: string): HookEvent[] {
  return readFileSync(
    new URL('../../../shared/__fixtures__/claude-task-notification-hooks.jsonl', import.meta.url),
    'utf8'
  )
    .split('\n')
    .filter(Boolean)
    .map((line): { scenario: string; t: number; payload?: Record<string, unknown> } =>
      JSON.parse(line)
    )
    .filter((record) => record.scenario === scenario && record.payload)
    .map((record) => ({ at: START + Math.round(record.t * 1_000), payload: record.payload ?? {} }))
}

function heldSubagentRun(leadStop: Record<string, unknown>): HookEvent[] {
  return [
    { at: START, payload: { hook_event_name: 'UserPromptSubmit', prompt: 'review the PR' } },
    {
      at: START + 1_000,
      payload: { hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'general-purpose' }
    },
    {
      at: START + 6_000,
      payload: { ...leadStop, background_tasks: [runningTask('a1', 'subagent', 30)] }
    }
  ]
}

describe('Claude background-work completion notifications', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(START)
    dispatchTerminalNotification.mockClear()
    dispatchAgentHookTerminalLifecycle.mockClear()
    mockStoreState = {
      settings: {
        experimentalTerminalAttention: false,
        notifications: {
          enabled: true,
          agentTaskComplete: true
        }
      },
      ptyIdsByTabId: {
        'tab-1': ['pty-1']
      },
      suppressedPtyExitIds: {},
      tabsByWorktree: {
        [WORKTREE_ID]: [{ id: 'tab-1', ptyId: 'pty-1' }]
      },
      terminalLayoutsByTabId: {},
      agentLaunchConfigByPaneKey: {},
      agentStatusByPaneKey: {},
      getAgentLaunchConfigForStatusEntry: () => undefined
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function play(events: HookEvent[]): Promise<{ alerts: Alert[]; rows: HookRow[] }> {
    const { observeAgentHookCompletionForNotification } =
      await import('./agent-hook-completion-notifications')
    const listener = createHookListenerState()
    const rows: HookRow[] = []
    const alerts: Alert[] = []
    let previous: HookRow | undefined

    dispatchTerminalNotification.mockImplementation((_worktreeId, event) => {
      const snapshot = event.agentStatusSnapshot
      alerts.push({
        at: Date.now(),
        state: snapshot?.state,
        verdict: snapshot ? agentMainAgentVerdict(snapshot) : null,
        body: snapshot?.lastAssistantMessage
      })
    })

    for (const event of events) {
      vi.advanceTimersByTime(Math.max(0, event.at - Date.now()))
      const normalized = normalizeHookPayload(
        listener,
        'claude',
        { paneKey: PANE_KEY, payload: event.payload },
        'production'
      )
      if (!normalized) {
        continue
      }
      const row = pinStateStartedAt(previous, normalized.payload, event.at)
      previous = row
      rows.push(row)
      observeAgentHookCompletionForNotification({
        paneKey: PANE_KEY,
        worktreeId: WORKTREE_ID,
        payload: row
      })
    }
    vi.advanceTimersByTime(HOOK_DONE_QUIET_MS)

    return { alerts, rows }
  }

  it.each([
    ['shells', 'shell', 'shell'],
    ['subagents', 'subagent', 'subagent'],
    ['subagent and shell', 'subagent', 'shell']
  ] as const)(
    'background %s: alerts done once, when the lead ends with nothing in flight',
    async (_label, longKind, shortKind) => {
      const { events, finalStopAt } = twoBackgroundTasksRun(longKind, shortKind)
      const { alerts, rows } = await play(events)

      expect(rows.find((row) => row.lastAssistantMessage === 'STARTED')?.state).toBe('working')
      expect(alerts).toEqual([
        { at: finalStopAt + HOOK_DONE_QUIET_MS, state: 'done', verdict: null, body: 'DONE-20' }
      ])
    }
  )

  it('alerts done once for the captured two-subagent run', async () => {
    const events = capturedScenario('two-subagents-together')
    const finalStopAt = events.findLast((event) => event.payload.hook_event_name === 'Stop')?.at
    const { alerts } = await play(events)

    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.state).toBe('done')
    expect(alerts[0]?.at).toBeGreaterThan(finalStopAt ?? Number.POSITIVE_INFINITY)
  })

  it('alerts done when the last subagent drains without waking the lead', async () => {
    const { alerts } = await play([
      ...heldSubagentRun({
        hook_event_name: 'Stop',
        last_assistant_message: 'Which cells need hand-verification?'
      }),
      { at: START + 55_000, payload: { hook_event_name: 'SubagentStop', agent_id: 'a1' } }
    ])

    expect(alerts).toEqual([
      {
        at: START + 55_000 + HOOK_DONE_QUIET_MS,
        state: 'done',
        verdict: null,
        body: 'Which cells need hand-verification?'
      }
    ])
  })

  it('alerts needs-input from a background subagent while the lead is held', async () => {
    const { alerts } = await play([
      ...heldSubagentRun({ hook_event_name: 'Stop', last_assistant_message: 'Review started.' }),
      {
        at: START + 9_000,
        payload: {
          hook_event_name: 'PermissionRequest',
          agent_id: 'a1',
          agent_type: 'general-purpose',
          tool_name: 'Bash',
          tool_input: { command: 'git push' }
        }
      }
    ])

    expect(alerts.map(({ at, state }) => ({ at, state }))).toEqual([
      { at: START + 9_000, state: 'waiting' }
    ])
  })

  it('alerts a failed lead turn at once and not again when its background work drains', async () => {
    const { alerts } = await play([
      ...heldSubagentRun({ hook_event_name: 'StopFailure' }),
      { at: START + 55_000, payload: { hook_event_name: 'SubagentStop', agent_id: 'a1' } }
    ])

    expect(alerts.map(({ at, verdict }) => ({ at, verdict }))).toEqual([
      { at: START + 6_000, verdict: 'failure' }
    ])
  })
})
