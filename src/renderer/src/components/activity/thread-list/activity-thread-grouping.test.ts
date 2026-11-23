import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../../shared/agent-status/contracts/agent-status-types'
import type { AgentTurnOutcome } from '../../../../../shared/agent-status/lifecycle/agent-turn-outcome'
import type { Repo } from '../../../../../shared/repository/repo-types'
import type { AgentPaneThread } from '../threads/activity-thread-types'
import { makeWorktree } from '@/store/slices/worktrees/worktree.test-fixture'
import { makeTab } from '@/store/terminals/testing/terminal-tab.test-fixture'
import { buildActivityThreadGroups } from './activity-thread-grouping'

const worktree = makeWorktree({ id: 'wt-1', repoId: 'repo-1' })
const workRepo: Repo = {
  id: 'repo-work',
  path: '/work/repo',
  displayName: 'Work repo',
  badgeColor: '#2563eb',
  addedAt: 1,
  workProject: true
}

function thread(paneKey: string, overrides: Partial<AgentPaneThread> = {}): AgentPaneThread {
  return {
    paneKey,
    paneTitle: paneKey,
    worktree,
    repo: null,
    tab: makeTab({ id: paneKey, worktreeId: worktree.id }),
    agentType: 'claude',
    // No live state and no status row reads as a finished (done) turn.
    currentAgentState: null,
    currentAgentEntry: null,
    responsePreview: '',
    latestTimestamp: 1,
    latestEvent: null,
    events: [],
    unread: false,
    priority: 2,
    savedMarker: null,
    attentionStartedAt: null,
    attentionEligible: false,
    sessionIdentity: null,
    ...overrides
  }
}

function finishedPaneEntry(outcome: AgentTurnOutcome): AgentStatusEntry {
  return {
    state: 'done',
    prompt: '',
    updatedAt: 1,
    stateStartedAt: 1,
    paneKey: 'pane',
    stateHistory: [],
    mainAgent: { state: 'done', outcome, stateStartedAt: 1 }
  }
}

const threads = [
  thread('working-old', { currentAgentState: 'working', latestTimestamp: 100 }),
  thread('monitoring', { currentAgentState: 'monitoring' }),
  thread('waiting-new', { currentAgentState: 'waiting', attentionStartedAt: 20 }),
  thread('done-read-p3', { priority: 3 }),
  thread('waiting-p1-oldest', {
    currentAgentState: 'waiting',
    priority: 1,
    attentionStartedAt: 5
  }),
  thread('working-new', { currentAgentState: 'working', latestTimestamp: 200 }),
  thread('done-unread', { unread: true }),
  thread('blocked-p1', { currentAgentState: 'blocked', priority: 1 }),
  thread('working-p3', { currentAgentState: 'working', priority: 3 }),
  thread('waiting-work', { currentAgentState: 'waiting', repo: workRepo, attentionStartedAt: 30 }),
  thread('waiting-old', { currentAgentState: 'waiting', attentionStartedAt: 10 }),
  thread('done-unread-p4', { unread: true, priority: 4 })
]

function groupOrder(
  workProjectPriorityRaised: boolean,
  rows: AgentPaneThread[] = threads
): Record<string, string[]> {
  return Object.fromEntries(
    buildActivityThreadGroups(rows, 'status', { workProjectPriorityRaised }).map((group) => [
      group.key,
      group.threads.map((row) => row.paneKey)
    ])
  )
}

describe('Activity status grouping', () => {
  it('splits by effective priority tier, then orders by state, priority, unread and age', () => {
    expect(groupOrder(true)).toEqual({
      'priority:high': ['waiting-work', 'done-unread-p4', 'done-read-p3', 'working-p3'],
      'priority:other': [
        'waiting-old',
        'waiting-new',
        'waiting-p1-oldest',
        'blocked-p1',
        'done-unread',
        'working-new',
        'working-old',
        'monitoring'
      ]
    })
  })

  it('lowers work-project sessions when the Work switch is off', () => {
    const groups = groupOrder(false)
    expect(groups['priority:high']).not.toContain('waiting-work')
    const otherOrder = groups['priority:other']
    const workIndex = otherOrder.indexOf('waiting-work')
    expect(otherOrder.slice(workIndex - 1, workIndex + 2)).toEqual([
      'waiting-p1-oldest',
      'waiting-work',
      'blocked-p1'
    ])
  })

  it('puts unread rows first when state and effective priority tie, then breaks ties by identity', () => {
    const order = groupOrder(true, [
      thread('waiting-read-older', { currentAgentState: 'waiting', attentionStartedAt: 5 }),
      thread('waiting-unread-newer', {
        currentAgentState: 'waiting',
        unread: true,
        attentionStartedAt: 50
      }),
      thread('twin-b', { currentAgentState: 'working', sessionIdentity: 'session-b' }),
      thread('twin-a', { currentAgentState: 'working', sessionIdentity: 'session-a' })
    ])
    expect(order).toEqual({
      'priority:other': ['waiting-unread-newer', 'waiting-read-older', 'twin-a', 'twin-b']
    })
  })

  it('ranks outcome and quiet states around unread and read completions', () => {
    const order = groupOrder(true, [
      thread('unverifiable', { currentAgentState: 'unverifiable' }),
      thread('working', { currentAgentState: 'working' }),
      thread('done-read'),
      thread('unconfirmed', { paneEntry: finishedPaneEntry('unconfirmed') }),
      thread('interrupted', { paneEntry: finishedPaneEntry('cancellation') }),
      thread('done-unread', { unread: true }),
      thread('failed', { paneEntry: finishedPaneEntry('failure') })
    ])
    expect(order).toEqual({
      'priority:other': [
        'failed',
        'done-unread',
        'interrupted',
        'unconfirmed',
        'done-read',
        'working',
        'unverifiable'
      ]
    })
  })

  it('keeps migration notices out of the priority tiers', () => {
    const order = groupOrder(true, [
      thread('migration', { priority: 5, migrationUnsupportedPtyId: 'migrated-terminal' }),
      thread('working', { currentAgentState: 'working' })
    ])
    expect(order).toEqual({
      'priority:other': ['working'],
      'migration-notice': ['migration']
    })
  })
})
