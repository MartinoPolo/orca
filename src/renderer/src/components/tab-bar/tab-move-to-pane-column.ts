import { useAppStore } from '../../store'
import type { TabSplitDirection } from '../../store/slices/tabs'
import { findLayoutSiblingOnSplitSide } from '../../store/slices/pane-column-split-drop-no-op'
import { resolveBrowserWorkspaceOwner } from '../../lib/browser-workspace-source-resolution'
import { mirrorWebRuntimeTabMove } from './web-runtime-tab-move-mirror'

type TabMovePaneColumnState = Pick<
  ReturnType<typeof useAppStore.getState>,
  'unifiedTabsByWorktree' | 'groupsByWorktree'
>

export function canMoveTabToNewPaneColumnFromState(
  state: TabMovePaneColumnState,
  unifiedTabId: string,
  groupId: string
): boolean {
  for (const [worktreeId, tabs] of Object.entries(state.unifiedTabsByWorktree)) {
    const tab = tabs.find((candidate) => candidate.id === unifiedTabId)
    if (!tab || tab.groupId !== groupId) {
      continue
    }
    const group = (state.groupsByWorktree[worktreeId] ?? []).find(
      (candidate) => candidate.id === groupId
    )
    if (!group) {
      return false
    }
    // Why: mirror dropUnifiedTab — splitting the only tab in a group onto an
    // adjacent split pane is a layout no-op the store rejects.
    return group.tabOrder.length > 1
  }
  return false
}

export function canMoveTabToNewPaneColumn(unifiedTabId: string, groupId: string): boolean {
  return canMoveTabToNewPaneColumnFromState(useAppStore.getState(), unifiedTabId, groupId)
}

function moveTabInDirection(
  worktreeId: string,
  unifiedTabId: string,
  direction: TabSplitDirection
): boolean {
  const state = useAppStore.getState()
  const tab = (state.unifiedTabsByWorktree[worktreeId] ?? []).find(
    (candidate) => candidate.id === unifiedTabId
  )
  const group = (state.groupsByWorktree[worktreeId] ?? []).find(
    (candidate) => candidate.id === tab?.groupId && candidate.tabOrder.includes(unifiedTabId)
  )
  if (!group || !tab) {
    return false
  }

  const layout = state.layoutByWorktree[worktreeId]
  const adjacentGroupId = layout ? findLayoutSiblingOnSplitSide(layout, group.id, direction) : null
  if (adjacentGroupId) {
    const moved = state.moveUnifiedTabToGroup(tab.id, adjacentGroupId, { activate: true })
    if (moved) {
      mirrorWebRuntimeTabMove({
        kind: 'move-to-group',
        worktreeId,
        tabId: tab.id,
        targetGroupId: adjacentGroupId
      })
    }
    return moved
  }

  if (group.tabOrder.length <= 1) {
    return false
  }
  return moveTabToNewPaneColumn({ unifiedTabId: tab.id, groupId: group.id, direction })
}

export function moveActiveTabInDirection(
  worktreeId: string,
  direction: TabSplitDirection
): boolean {
  const state = useAppStore.getState()
  const groupId = state.activeGroupIdByWorktree[worktreeId]
  const group = (state.groupsByWorktree[worktreeId] ?? []).find(
    (candidate) => candidate.id === groupId
  )
  if (!group?.activeTabId) {
    return false
  }
  return moveTabInDirection(worktreeId, group.activeTabId, direction)
}

export function moveBrowserTabInDirection(sourceId: string, direction: TabSplitDirection): boolean {
  const state = useAppStore.getState()
  const owner = resolveBrowserWorkspaceOwner(state, sourceId)
  if (!owner) {
    return false
  }
  const tab = (state.unifiedTabsByWorktree[owner.worktreeId] ?? []).find(
    (candidate) => candidate.contentType === 'browser' && candidate.entityId === owner.workspaceId
  )
  return tab ? moveTabInDirection(owner.worktreeId, tab.id, direction) : false
}

export function moveTabToNewPaneColumn(args: {
  unifiedTabId: string
  groupId: string
  direction: TabSplitDirection
}): boolean {
  const state = useAppStore.getState()
  const worktreeId = Object.entries(state.unifiedTabsByWorktree).find(([, tabs]) =>
    tabs.some(
      (candidate) => candidate.id === args.unifiedTabId && candidate.groupId === args.groupId
    )
  )?.[0]
  if (!worktreeId || !canMoveTabToNewPaneColumnFromState(state, args.unifiedTabId, args.groupId)) {
    return false
  }
  const moved = state.dropUnifiedTab(args.unifiedTabId, {
    groupId: args.groupId,
    splitDirection: args.direction
  })
  if (moved) {
    mirrorWebRuntimeTabMove({
      kind: 'split',
      worktreeId,
      tabId: args.unifiedTabId,
      targetGroupId: args.groupId,
      splitDirection: args.direction
    })
  }
  return moved
}
