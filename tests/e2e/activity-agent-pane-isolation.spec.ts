import type { Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import {
  splitActiveTerminalPane,
  waitForActiveTerminalManager,
  waitForPaneCount,
  waitForPaneIdentitySnapshot,
  type PaneIdentitySnapshot
} from './helpers/terminal'
import { clickFileInExplorer } from './helpers/file-explorer'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { clickHiddenRendererPointer } from './hidden-renderer-pointer'

type SeededActivityThread = {
  paneKey: string
  leafId: string
  prompt: string
  message: string
}

type ActivePaneSelection = {
  activeWorktreeId: string | null
  activeGroupId: string | null
  activeTabId: string | null
  activeTabType: string | null
  activeLeafId: string | null
  activePaneId: number | null
}

type SplitGroupTerminal = {
  sourceGroupId: string
  groupId: string
  tabId: string
}

function agentsSidebarButton(page: Page) {
  return page.getByRole('button', { name: 'View activity', exact: true })
}

async function seedActivityThread(
  page: Page,
  thread: SeededActivityThread,
  title: string,
  state: 'blocked' | 'done',
  startedAt: number
): Promise<void> {
  await page.evaluate(
    ({ thread, title, state, startedAt }) => {
      const store = window.__store
      if (!store) {
        throw new Error('window.__store is not available')
      }

      store.getState().setAgentStatus(
        thread.paneKey,
        {
          state,
          prompt: thread.prompt,
          agentType: 'codex',
          lastAssistantMessage: thread.message
        },
        title,
        { updatedAt: startedAt, stateStartedAt: startedAt }
      )
    },
    { thread, title, state, startedAt }
  )
}

async function seedActivityThreadsForSplitPanes(
  page: Page,
  snapshot: PaneIdentitySnapshot
): Promise<[SeededActivityThread, SeededActivityThread]> {
  const [firstPane, secondPane] = snapshot.panes
  if (!firstPane || !secondPane) {
    throw new Error('Activity pane isolation test needs two split panes')
  }

  const now = Date.now()
  const first: SeededActivityThread = {
    paneKey: `${snapshot.tabId}:${firstPane.leafId}`,
    leafId: firstPane.leafId,
    prompt: `ACTIVITY_UUID_LEFT_${now}`,
    message: 'Left pane is waiting for user input.'
  }
  const second: SeededActivityThread = {
    paneKey: `${snapshot.tabId}:${secondPane.leafId}`,
    leafId: secondPane.leafId,
    prompt: `ACTIVITY_UUID_RIGHT_${now}`,
    message: 'Right pane finished its turn.'
  }

  await seedActivityThread(page, first, 'Codex left pane', 'blocked', now - 2_000)
  await seedActivityThread(page, second, 'Codex right pane', 'done', now - 1_000)

  return [first, second]
}

async function enableInlineAgentCards(page: Page): Promise<void> {
  await page.evaluate(() => {
    const store = window.__store
    if (!store) {
      throw new Error('window.__store is not available')
    }

    const state = store.getState()
    if (!state.worktreeCardProperties.includes('inline-agents')) {
      state.setWorktreeCardProperties([...state.worktreeCardProperties, 'inline-agents'])
    }
    state.setAgentActivityDisplayMode('full')
    state.closeActivityPage()
  })
}

async function enableActivityAgentsView(page: Page): Promise<void> {
  await page.evaluate(async () => {
    // Keep the migration intro from covering the activity toggle.
    const settings = await window.api.settings.set({
      agentsSidebarIntroShown: true
    })
    window.__store?.setState({ settings })
    window.__store?.getState().setAgentsReadFilter('all')
  })
}

async function clickWorkspaceCardAgentRow(page: Page, thread: SeededActivityThread): Promise<void> {
  const agentsGroup = page.getByRole('group', { name: 'Agents' }).first()
  const agentMessage = agentsGroup.getByText(thread.message, { exact: true })
  await expect(agentMessage).toBeVisible({ timeout: 10_000 })
  await clickHiddenRendererPointer(page, agentMessage)
}

async function readActivePaneSelection(page: Page): Promise<ActivePaneSelection> {
  return page.evaluate(() => {
    const store = window.__store
    if (!store) {
      return {
        activeWorktreeId: null,
        activeGroupId: null,
        activeTabId: null,
        activeTabType: null,
        activeLeafId: null,
        activePaneId: null
      }
    }

    const state = store.getState()
    const activeWorktreeId = state.activeWorktreeId ?? null
    const activeGroupId = activeWorktreeId
      ? (state.activeGroupIdByWorktree[activeWorktreeId] ?? null)
      : null
    const activeTabId = state.activeTabId ?? null
    const activePane = activeTabId
      ? (window.__paneManagers?.get(activeTabId)?.getActivePane?.() ?? null)
      : null

    return {
      activeWorktreeId,
      activeGroupId,
      activeTabId,
      activeTabType: state.activeTabType ?? null,
      activeLeafId: activePane?.leafId ?? null,
      activePaneId: activePane?.id ?? null
    }
  })
}

function terminalPaneForLeaf(page: Page, leafId: string) {
  return page.locator(`.pane[data-leaf-id="${leafId}"]`).first()
}

async function createTerminalInNewSplitGroup(page: Page): Promise<SplitGroupTerminal> {
  return page.evaluate(() => {
    const store = window.__store
    if (!store) {
      throw new Error('window.__store is not available')
    }
    const state = store.getState()
    const worktreeId = state.activeWorktreeId
    if (!worktreeId) {
      throw new Error('No active worktree for split-group terminal setup')
    }
    const sourceGroupId =
      state.activeGroupIdByWorktree[worktreeId] ?? state.groupsByWorktree[worktreeId]?.[0]?.id
    if (!sourceGroupId) {
      throw new Error('No source group for split-group terminal setup')
    }

    const groupId = state.createEmptySplitGroup(worktreeId, sourceGroupId, 'right')
    if (!groupId) {
      throw new Error('Failed to create split group')
    }

    const tab = state.createTab(worktreeId, groupId, undefined, { activate: true })
    state.focusGroup(worktreeId, groupId)
    state.setActiveTab(tab.id)
    state.setActiveTabType('terminal')
    return { sourceGroupId, groupId, tabId: tab.id }
  })
}

test.describe('Activity Agent Pane Isolation', () => {
  test.beforeEach(async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)
    await enableActivityAgentsView(orcaPage)
    await waitForActiveWorktree(orcaPage)
    await ensureTerminalVisible(orcaPage)
    const hasPaneManager = await waitForActiveTerminalManager(orcaPage, 30_000)
      .then(() => true)
      .catch(() => false)
    test.skip(
      !hasPaneManager,
      'Electron automation in this environment never mounts the live TerminalPane manager, so Activity pane isolation would only fail on harness setup.'
    )
    await waitForPaneCount(orcaPage, 1, 30_000)
  })

  test('selecting agent rows focuses the matching split pane by stable leaf id', async ({
    orcaPage
  }) => {
    await splitActiveTerminalPane(orcaPage, 'vertical')
    await waitForPaneCount(orcaPage, 2)
    const snapshot = await waitForPaneIdentitySnapshot(orcaPage, 2)
    const [first, second] = await seedActivityThreadsForSplitPanes(orcaPage, snapshot)

    await clickHiddenRendererPointer(orcaPage, agentsSidebarButton(orcaPage))
    await expect(orcaPage.getByText(first.prompt)).toBeVisible()
    await expect(orcaPage.getByText(second.prompt)).toBeVisible()

    const firstActivityRow = orcaPage.getByRole('listitem', { name: first.prompt, exact: true })
    await firstActivityRow.evaluate((element) => {
      element.addEventListener(
        'click',
        () => element.setAttribute('data-hidden-pointer-click-received', 'true'),
        { once: true }
      )
    })
    await clickHiddenRendererPointer(orcaPage, firstActivityRow)
    await expect(firstActivityRow).toHaveAttribute('data-hidden-pointer-click-received', 'true')
    await expect
      .poll(async () => readActivePaneSelection(orcaPage), {
        timeout: 10_000,
        message: 'Agents sidebar row did not focus the first selected split pane'
      })
      .toMatchObject({
        activeTabId: snapshot.tabId,
        activeLeafId: first.leafId
      })

    await expect(
      orcaPage.getByRole('button', { name: 'Turn off activity view', exact: true })
    ).toHaveAttribute('aria-pressed', 'true')
    await clickHiddenRendererPointer(
      orcaPage,
      orcaPage.getByRole('listitem', { name: second.prompt, exact: true })
    )
    await expect
      .poll(async () => readActivePaneSelection(orcaPage), {
        timeout: 10_000,
        message: 'Agents sidebar row did not focus the second selected split pane'
      })
      .toMatchObject({
        activeTabId: snapshot.tabId,
        activeLeafId: second.leafId
      })
  })

  test('workspace card agent rows focus the matching terminal split pane', async ({ orcaPage }) => {
    await splitActiveTerminalPane(orcaPage, 'vertical')
    await waitForPaneCount(orcaPage, 2)
    const snapshot = await waitForPaneIdentitySnapshot(orcaPage, 2)
    const [first, second] = await seedActivityThreadsForSplitPanes(orcaPage, snapshot)

    await enableInlineAgentCards(orcaPage)

    await clickWorkspaceCardAgentRow(orcaPage, first)
    await expect
      .poll(async () => readActivePaneSelection(orcaPage), {
        timeout: 10_000,
        message: 'Workspace-card row did not focus the first split pane'
      })
      .toMatchObject({
        activeTabId: snapshot.tabId,
        activeLeafId: first.leafId
      })

    await clickWorkspaceCardAgentRow(orcaPage, second)
    await expect
      .poll(async () => readActivePaneSelection(orcaPage), {
        timeout: 10_000,
        message: 'Workspace-card row did not focus the second split pane'
      })
      .toMatchObject({
        activeTabId: snapshot.tabId,
        activeLeafId: second.leafId
      })
  })

  test('workspace card agent rows reveal terminal logs from a non-terminal surface', async ({
    orcaPage
  }) => {
    await splitActiveTerminalPane(orcaPage, 'vertical')
    await waitForPaneCount(orcaPage, 2)
    const snapshot = await waitForPaneIdentitySnapshot(orcaPage, 2)
    const [first] = await seedActivityThreadsForSplitPanes(orcaPage, snapshot)

    await enableInlineAgentCards(orcaPage)
    await expect(terminalPaneForLeaf(orcaPage, first.leafId)).toBeVisible()
    // Why: this reproduces the user-visible failure mode: the agent row is
    // visible in the sidebar while the main workspace surface is not Terminal.
    await expect(await clickFileInExplorer(orcaPage, ['README.md'])).toBe('README.md')
    await expect
      .poll(() => readActivePaneSelection(orcaPage))
      .toMatchObject({
        activeTabType: 'editor',
        activeTabId: snapshot.tabId
      })
    await expect(terminalPaneForLeaf(orcaPage, first.leafId)).toBeHidden()

    await clickWorkspaceCardAgentRow(orcaPage, first)

    await expect
      .poll(async () => readActivePaneSelection(orcaPage), {
        timeout: 10_000,
        message: 'Workspace-card row did not reveal the terminal log surface'
      })
      .toMatchObject({
        activeTabType: 'terminal',
        activeTabId: snapshot.tabId,
        activeLeafId: first.leafId
      })
    await expect(terminalPaneForLeaf(orcaPage, first.leafId)).toBeVisible()
  })

  test('workspace card agent rows focus the matching split-group terminal pane', async ({
    orcaPage
  }) => {
    await splitActiveTerminalPane(orcaPage, 'vertical')
    await waitForPaneCount(orcaPage, 2)
    const firstGroupSnapshot = await waitForPaneIdentitySnapshot(orcaPage, 2)
    const [first, second] = await seedActivityThreadsForSplitPanes(orcaPage, firstGroupSnapshot)

    const splitGroup = await createTerminalInNewSplitGroup(orcaPage)
    await waitForActiveTerminalManager(orcaPage, 30_000)
    await waitForPaneCount(orcaPage, 1, 30_000)
    const secondGroupSnapshot = await waitForPaneIdentitySnapshot(orcaPage, 1)
    const secondGroupPane = secondGroupSnapshot.panes[0]
    if (!secondGroupPane) {
      throw new Error('Split-group terminal did not mount a pane')
    }
    const now = Date.now()
    const splitGroupThread: SeededActivityThread = {
      paneKey: `${secondGroupSnapshot.tabId}:${secondGroupPane.leafId}`,
      leafId: secondGroupPane.leafId,
      prompt: `ACTIVITY_UUID_SPLIT_GROUP_${now}`,
      message: 'Split group pane is waiting for user input.'
    }
    await seedActivityThread(orcaPage, splitGroupThread, 'Codex split group pane', 'blocked', now)

    await enableInlineAgentCards(orcaPage)

    await clickWorkspaceCardAgentRow(orcaPage, splitGroupThread)
    await expect
      .poll(async () => readActivePaneSelection(orcaPage), {
        timeout: 10_000,
        message: 'Workspace-card row did not focus the split-group terminal pane'
      })
      .toMatchObject({
        activeGroupId: splitGroup.groupId,
        activeTabId: secondGroupSnapshot.tabId,
        activeLeafId: splitGroupThread.leafId
      })

    await clickWorkspaceCardAgentRow(orcaPage, first)
    await expect
      .poll(async () => readActivePaneSelection(orcaPage), {
        timeout: 10_000,
        message: 'Workspace-card row did not return to the first split group'
      })
      .toMatchObject({
        activeGroupId: splitGroup.sourceGroupId,
        activeTabId: firstGroupSnapshot.tabId,
        activeLeafId: first.leafId
      })

    await clickWorkspaceCardAgentRow(orcaPage, second)
    await expect
      .poll(async () => readActivePaneSelection(orcaPage), {
        timeout: 10_000,
        message: 'Workspace-card row did not focus the sibling pane after group switch'
      })
      .toMatchObject({
        activeGroupId: splitGroup.sourceGroupId,
        activeTabId: firstGroupSnapshot.tabId,
        activeLeafId: second.leafId
      })
  })

  test('hidden renderer pointer rejects an obstructed activity toggle', async ({ orcaPage }) => {
    const obstructionId = 'hidden-renderer-pointer-obstruction'
    const activityToggle = agentsSidebarButton(orcaPage)
    await activityToggle.evaluate((element, id) => {
      const rect = element.getBoundingClientRect()
      const obstruction = document.createElement('div')
      obstruction.id = id
      obstruction.style.position = 'fixed'
      obstruction.style.left = `${rect.left}px`
      obstruction.style.top = `${rect.top}px`
      obstruction.style.width = `${rect.width}px`
      obstruction.style.height = `${rect.height}px`
      obstruction.style.zIndex = '2147483647'
      document.body.append(obstruction)
    }, obstructionId)

    try {
      await expect(clickHiddenRendererPointer(orcaPage, activityToggle)).rejects.toThrow(
        'Hidden renderer pointer target is obstructed at its center'
      )
    } finally {
      await orcaPage.evaluate((id) => document.getElementById(id)?.remove(), obstructionId)
    }
  })
})
