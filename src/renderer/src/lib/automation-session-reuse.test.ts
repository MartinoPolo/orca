import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import type { AutomationRun } from '../../../shared/automations-types'
import { findReusableAutomationSession } from './automation-session-reuse'

const leafId = '11111111-1111-4111-8111-111111111111'
const paneKey = `tab-1:${leafId}`
const splitLeafId = '22222222-2222-4222-8222-222222222222'
const splitPaneKey = `tab-1:${splitLeafId}`

function run(overrides: Partial<AutomationRun>): AutomationRun {
  return {
    id: 'run-1',
    automationId: 'auto-1',
    title: 'Run 1',
    scheduledFor: 1,
    status: 'completed',
    trigger: 'manual',
    workspaceId: 'wt-1',
    workspaceDisplayName: 'Workspace',
    sessionKind: 'terminal',
    chatSessionId: null,
    terminalSessionId: 'tab-1',
    terminalPaneKey: paneKey,
    terminalPtyId: 'pty-1',
    outputSnapshot: null,
    precheckResult: null,
    usage: null,
    error: null,
    startedAt: 1,
    dispatchedAt: 1,
    createdAt: 1,
    ...overrides
  }
}

function status(overrides: Partial<AgentStatusEntry> = {}): AgentStatusEntry {
  return {
    state: 'done',
    prompt: 'previous',
    updatedAt: 10,
    stateStartedAt: 10,
    paneKey,
    stateHistory: [],
    agentType: 'claude',
    ...overrides
  }
}

describe('automation session reuse in the renderer store', () => {
  it('uses the PTY recorded for the exact split-pane run', () => {
    const session = findReusableAutomationSession({
      automationId: 'auto-1',
      agentId: 'claude',
      worktreeId: 'wt-1',
      currentRunId: 'run-current',
      runs: [
        run({
          id: 'run-new',
          terminalSessionId: 'tab-1',
          terminalPaneKey: splitPaneKey,
          terminalPtyId: 'pty-right',
          createdAt: 2
        })
      ],
      state: {
        agentStatusByPaneKey: {
          [splitPaneKey]: status({ paneKey: splitPaneKey })
        },
        ptyIdsByTabId: { 'tab-1': ['pty-left', 'pty-right'] },
        terminalLayoutsByTabId: {
          'tab-1': {
            ptyIdsByLeafId: {
              [leafId]: 'pty-left',
              [splitLeafId]: 'pty-right'
            }
          }
        },
        unifiedTabsByWorktree: {
          'wt-1': [{ contentType: 'terminal', entityId: 'tab-1' }]
        }
      } as never
    })

    expect(session).toEqual({ tabId: 'tab-1', ptyId: 'pty-right', paneKey: splitPaneKey })
  })

  it('does not reuse an unrelated split pane for a run with exact pane identity', () => {
    const session = findReusableAutomationSession({
      automationId: 'auto-1',
      agentId: 'claude',
      worktreeId: 'wt-1',
      currentRunId: 'run-current',
      runs: [run({ id: 'run-new', terminalSessionId: 'tab-1', createdAt: 2 })],
      state: {
        agentStatusByPaneKey: {
          [splitPaneKey]: status({ paneKey: splitPaneKey })
        },
        ptyIdsByTabId: { 'tab-1': ['pty-1', 'pty-right'] },
        terminalLayoutsByTabId: {
          'tab-1': {
            ptyIdsByLeafId: {
              [leafId]: 'pty-1',
              [splitLeafId]: 'pty-right'
            }
          }
        },
        unifiedTabsByWorktree: {
          'wt-1': [{ contentType: 'terminal', entityId: 'tab-1' }]
        }
      } as never
    })

    expect(session).toBeNull()
  })

  it('rejects an exact run pane when its PTY is no longer live', () => {
    const session = findReusableAutomationSession({
      automationId: 'auto-1',
      agentId: 'claude',
      worktreeId: 'wt-1',
      currentRunId: 'run-current',
      runs: [run({ id: 'run-new', terminalSessionId: 'tab-1', createdAt: 2 })],
      state: {
        agentStatusByPaneKey: { [paneKey]: status() },
        ptyIdsByTabId: { 'tab-1': ['pty-other'] },
        terminalLayoutsByTabId: { 'tab-1': { ptyIdsByLeafId: { [leafId]: 'pty-1' } } },
        unifiedTabsByWorktree: {
          'wt-1': [{ contentType: 'terminal', entityId: 'tab-1' }]
        }
      } as never
    })

    expect(session).toBeNull()
  })

  it('reuses a pane only when it was launched under the same account', () => {
    const work = { environmentName: 'CLAUDE_CONFIG_DIR', directory: '/home/ada/.claude-work' }
    const defaultAccount = { environmentName: 'CLAUDE_CONFIG_DIR', directory: undefined }
    const findFor = (
      recordedEnv: Record<string, string> | null,
      launchAccount: { environmentName: string; directory: string | undefined }
    ) =>
      findReusableAutomationSession({
        automationId: 'auto-1',
        agentId: 'claude',
        worktreeId: 'wt-1',
        currentRunId: 'run-current',
        runs: [run({ id: 'run-new', terminalSessionId: 'tab-1', createdAt: 2 })],
        launchAccount,
        // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The lookup reads only these fields; full tab and layout records are irrelevant here.
        state: {
          agentStatusByPaneKey: { [paneKey]: status() },
          ptyIdsByTabId: { 'tab-1': ['pty-1'] },
          terminalLayoutsByTabId: { 'tab-1': { ptyIdsByLeafId: { [leafId]: 'pty-1' } } },
          unifiedTabsByWorktree: { 'wt-1': [{ contentType: 'terminal', entityId: 'tab-1' }] },
          agentLaunchConfigByPaneKey: recordedEnv
            ? { [paneKey]: { launchConfig: { agentArgs: '', agentEnv: recordedEnv } } }
            : {}
        } as never
      })
    const workEnv = { CLAUDE_CONFIG_DIR: '/home/ada/.claude-work' }

    expect(findFor(workEnv, work)).toEqual({ tabId: 'tab-1', ptyId: 'pty-1', paneKey })
    expect(findFor({}, work)).toBeNull()
    expect(findFor(workEnv, defaultAccount)).toBeNull()
    // An unrecorded pane can only be assumed to run the default account.
    expect(findFor(null, defaultAccount)).not.toBeNull()
    expect(findFor(null, work)).toBeNull()
  })
})
