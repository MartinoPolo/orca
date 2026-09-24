// @vitest-environment happy-dom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearWorktreeAgentExpansionStateForTests,
  getWorktreeAgentExpansionCountForTests,
  MAX_PERSISTED_WORKTREE_AGENT_EXPANSIONS,
  seedWorktreeAgentExpansionStateForTests,
  useWorktreeAgentExpansionState
} from './worktree-card-agents-expansion-state'

let mockAgents: unknown[] = []

function mockAgent(paneKey: string, prompt: string): unknown {
  return {
    paneKey,
    tab: { id: paneKey.split(':')[0] },
    agentType: 'codex',
    rowSource: undefined,
    state: 'done',
    startedAt: 1000,
    entry: {
      prompt,
      lastAssistantMessage: undefined,
      state: 'done',
      stateStartedAt: 1000,
      stateHistory: [],
      orchestration: undefined
    },
    lineage: undefined
  }
}

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      agentActivityDisplayMode: 'compact',
      acknowledgedAgentsByPaneKey: {},
      cacheTimerByKey: {},
      dropAgentStatus: vi.fn(),
      dismissRetainedAgent: vi.fn(),
      agentSendPopoverTargetMode: null,
      agentStatusByPaneKey: {},
      agentStatusEpoch: 0,
      getKnownWorktreeById: () => undefined,
      repos: [],
      retainedAgentsByPaneKey: {},
      runtimePaneTitlesByTabId: {},
      sendPromptToSidebarAgentTarget: vi.fn(),
      sessionAttentionMetadataByIdentity: {},
      settings: { promptCacheTimerEnabled: false, promptCacheTtlMs: 60_000 },
      tabsByWorktree: {},
      terminalLayoutsByTabId: {},
      unifiedTabsByWorktree: {}
    })
}))

vi.mock('./useWorktreeAgentRows', () => ({
  useWorktreeAgentRows: vi.fn(() => mockAgents)
}))

vi.mock('@/hooks/use-now', () => ({
  useNow: vi.fn(() => 2000)
}))

vi.mock('./CacheTimer', () => ({
  default: () => null,
  usePromptCacheCountdownForPane: () => null,
  usePromptCacheCountdownStartedAt: () => null
}))

vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorktree: vi.fn()
}))

vi.mock('@/lib/activate-tab-and-focus-pane', () => ({
  activateTabAndFocusPane: vi.fn()
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

const mountedRoots: { root: Root; host: HTMLElement }[] = []

async function mountAgents(worktreeId: string): Promise<HTMLElement> {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  mountedRoots.push({ root, host })
  const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')
  await act(async () => {
    root.render(<WorktreeCardAgents worktreeId={worktreeId} />)
  })
  return host
}

function summaryButton(host: HTMLElement): HTMLButtonElement {
  // Flat agents have no per-agent child disclosure.
  const button = host.querySelector<HTMLButtonElement>('button[aria-expanded]')
  if (!button) {
    throw new Error('compact agent summary button not found')
  }
  return button
}

describe('WorktreeCardAgents inline-list expansion durability', () => {
  beforeEach(() => {
    clearWorktreeAgentExpansionStateForTests()
    mockAgents = [
      mockAgent('tab-1:1', 'One'),
      mockAgent('tab-2:2', 'Two'),
      mockAgent('tab-3:3', 'Three'),
      mockAgent('tab-4:4', 'Four')
    ]
  })

  afterEach(async () => {
    await act(async () => {
      for (const { root, host } of mountedRoots.splice(0)) {
        root.unmount()
        host.remove()
      }
    })
    document.body.innerHTML = ''
    clearWorktreeAgentExpansionStateForTests()
  })

  it('preserves an explicit collapse across a card remount and allows re-expansion', async () => {
    const host = await mountAgents('wt-remount')
    expect(summaryButton(host).getAttribute('aria-expanded')).toBe('true')
    expect(host.textContent).toContain('Four')

    await act(async () => {
      summaryButton(host).click()
    })
    expect(summaryButton(host).getAttribute('aria-expanded')).toBe('false')
    expect(getWorktreeAgentExpansionCountForTests()).toBe(1)
    expect(host.querySelector('.compact-agent-expansion-grid')?.getAttribute('aria-hidden')).toBe(
      'true'
    )

    await act(async () => {
      const first = mountedRoots.shift()!
      first.root.unmount()
      first.host.remove()
    })
    const remounted = await mountAgents('wt-remount')

    expect(summaryButton(remounted).getAttribute('aria-expanded')).toBe('false')
    await act(async () => {
      summaryButton(remounted).click()
    })
    expect(summaryButton(remounted).getAttribute('aria-expanded')).toBe('true')
    expect(getWorktreeAgentExpansionCountForTests()).toBe(0)
    expect(remounted.textContent).toContain('Four')
  })

  it('does not leak an explicit collapse between worktrees', async () => {
    const first = await mountAgents('wt-a')
    await act(async () => {
      summaryButton(first).click()
    })
    expect(summaryButton(first).getAttribute('aria-expanded')).toBe('false')

    const second = await mountAgents('wt-b')
    expect(summaryButton(second).getAttribute('aria-expanded')).toBe('true')
    expect(second.textContent).toContain('Four')
  })

  it('shows the remaining rows when a collapsed four-agent list shrinks to three', async () => {
    const host = await mountAgents('wt-shrink')
    await act(async () => {
      summaryButton(host).click()
    })
    expect(summaryButton(host).getAttribute('aria-expanded')).toBe('false')

    mockAgents = mockAgents.slice(0, 3)
    const { default: WorktreeCardAgents } = await import('./WorktreeCardAgents')
    await act(async () => {
      mountedRoots[0].root.render(<WorktreeCardAgents worktreeId="wt-shrink" className="updated" />)
    })

    expect(host.querySelector('.compact-agent-summary-button')).toBeNull()
    expect(host.textContent).toContain('One')
    expect(host.textContent).toContain('Two')
    expect(host.textContent).toContain('Three')
  })
})

describe('worktree-card-agents-expansion-state module cache', () => {
  beforeEach(() => {
    clearWorktreeAgentExpansionStateForTests()
  })

  afterEach(() => {
    clearWorktreeAgentExpansionStateForTests()
  })

  it('persists a collapsed lineage parent across a hook remount and toggles independently', async () => {
    function Probe({ worktreeId }: { worktreeId: string }) {
      const { collapsedLineageParents, toggleLineageParent } =
        useWorktreeAgentExpansionState(worktreeId)
      return (
        <button
          type="button"
          data-collapsed={collapsedLineageParents.has('pane-x') ? 'true' : 'false'}
          onClick={() => toggleLineageParent('pane-x')}
        >
          probe
        </button>
      )
    }

    const host = document.createElement('div')
    document.body.append(host)
    let root = createRoot(host)
    await act(async () => {
      root.render(<Probe worktreeId="wt-probe" />)
    })
    const read = () => host.querySelector('button')!.getAttribute('data-collapsed')
    expect(read()).toBe('false')

    await act(async () => {
      host.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(read()).toBe('true')

    // Remount the hook consumer: the collapsed parent must survive.
    await act(async () => root.unmount())
    root = createRoot(host)
    await act(async () => {
      root.render(<Probe worktreeId="wt-probe" />)
    })
    expect(read()).toBe('true')

    await act(async () => root.unmount())
    host.remove()
  })

  it('drops default (empty) state and bounds the cache with LRU eviction', () => {
    seedWorktreeAgentExpansionStateForTests('wt-default', {
      collapsedLineageParents: new Set(),
      compactRootListExpanded: true
    })
    expect(getWorktreeAgentExpansionCountForTests()).toBe(0)

    for (let index = 0; index < MAX_PERSISTED_WORKTREE_AGENT_EXPANSIONS + 25; index++) {
      seedWorktreeAgentExpansionStateForTests(`wt-${index}`, {
        collapsedLineageParents: new Set(),
        compactRootListExpanded: false
      })
    }
    expect(getWorktreeAgentExpansionCountForTests()).toBe(MAX_PERSISTED_WORKTREE_AGENT_EXPANSIONS)
  })

  it('persists lineage collapse independently of the default expanded root list', () => {
    seedWorktreeAgentExpansionStateForTests('wt-lineage', {
      collapsedLineageParents: new Set(['parent-pane']),
      compactRootListExpanded: true
    })
    expect(getWorktreeAgentExpansionCountForTests()).toBe(1)
    seedWorktreeAgentExpansionStateForTests('wt-lineage', {
      collapsedLineageParents: new Set(),
      compactRootListExpanded: true
    })
    expect(getWorktreeAgentExpansionCountForTests()).toBe(0)
  })
})
