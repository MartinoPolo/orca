import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../store'
import type { Tab } from '../../../../shared/tab-types'
import type { BrowserPage, BrowserWorkspace } from '../../../../shared/browser-workspace-types'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import {
  canMoveTabToNewPaneColumn,
  moveActiveTabInDirection,
  moveBrowserTabInDirection,
  moveTabToNewPaneColumn
} from './tab-move-to-pane-column'

const WT = 'wt-1'

const mocks = vi.hoisted(() => ({
  mirrorWebRuntimeTabMove: vi.fn()
}))

const storeActions = {
  dropUnifiedTab: useAppStore.getState().dropUnifiedTab,
  moveUnifiedTabToGroup: useAppStore.getState().moveUnifiedTabToGroup
}

vi.mock('./web-runtime-tab-move-mirror', () => ({
  mirrorWebRuntimeTabMove: mocks.mirrorWebRuntimeTabMove
}))

describe('tab-move-to-pane-column', () => {
  beforeEach(() => {
    mocks.mirrorWebRuntimeTabMove.mockReset()
    useAppStore.setState({
      ...storeActions,
      activeWorktreeId: WT,
      activeGroupIdByWorktree: { [WT]: 'group-1' },
      browserTabsByWorktree: {},
      browserPagesByWorkspace: {},
      groupsByWorktree: {
        [WT]: [
          {
            id: 'group-1',
            worktreeId: WT,
            activeTabId: 'tab-a',
            tabOrder: ['tab-a', 'tab-b']
          }
        ]
      },
      unifiedTabsByWorktree: {
        [WT]: [
          {
            id: 'tab-a',
            groupId: 'group-1',
            worktreeId: WT,
            contentType: 'terminal',
            entityId: 'term-a',
            label: 'A',
            customLabel: null,
            color: null,
            sortOrder: 0,
            createdAt: 0
          } satisfies Tab,
          {
            id: 'tab-b',
            groupId: 'group-1',
            worktreeId: WT,
            contentType: 'terminal',
            entityId: 'term-b',
            label: 'B',
            customLabel: null,
            color: null,
            sortOrder: 1,
            createdAt: 1
          } satisfies Tab
        ]
      },
      layoutByWorktree: {
        [WT]: { type: 'leaf', groupId: 'group-1' }
      }
    })
  })

  it('allows moving when the source group has more than one tab', () => {
    expect(canMoveTabToNewPaneColumn('tab-b', 'group-1')).toBe(true)
  })

  it('blocks moving the only tab in a group', () => {
    useAppStore.setState({
      groupsByWorktree: {
        [WT]: [
          {
            id: 'group-1',
            worktreeId: WT,
            activeTabId: 'tab-a',
            tabOrder: ['tab-a']
          }
        ]
      }
    })

    expect(canMoveTabToNewPaneColumn('tab-a', 'group-1')).toBe(false)
    expect(
      moveTabToNewPaneColumn({ unifiedTabId: 'tab-a', groupId: 'group-1', direction: 'right' })
    ).toBe(false)
    expect(moveActiveTabInDirection(WT, 'right')).toBe(false)
    expect(mocks.mirrorWebRuntimeTabMove).not.toHaveBeenCalled()
  })

  it('does nothing without an active group or active tab', () => {
    useAppStore.setState({ activeGroupIdByWorktree: {} })
    expect(moveActiveTabInDirection(WT, 'right')).toBe(false)

    useAppStore.setState({
      activeGroupIdByWorktree: { [WT]: 'group-1' },
      groupsByWorktree: {
        [WT]: [
          {
            id: 'group-1',
            worktreeId: WT,
            activeTabId: null,
            tabOrder: ['tab-a', 'tab-b']
          }
        ]
      }
    })
    expect(moveActiveTabInDirection(WT, 'right')).toBe(false)
    expect(mocks.mirrorWebRuntimeTabMove).not.toHaveBeenCalled()
  })

  it.each([
    ['left', 'horizontal', 'second'],
    ['right', 'horizontal', 'first'],
    ['up', 'vertical', 'second'],
    ['down', 'vertical', 'first']
  ] as const)(
    'moves the active tab %s into a direct adjacent leaf group',
    (direction, layoutDirection, sourcePosition) => {
      const sourceLeaf = { type: 'leaf', groupId: 'group-1' } as const
      const targetLeaf = { type: 'leaf', groupId: 'group-2' } as const
      useAppStore.setState({
        groupsByWorktree: {
          [WT]: [
            {
              id: 'group-1',
              worktreeId: WT,
              activeTabId: 'tab-a',
              tabOrder: ['tab-a']
            },
            {
              id: 'group-2',
              worktreeId: WT,
              activeTabId: 'tab-c',
              tabOrder: ['tab-c']
            }
          ]
        },
        unifiedTabsByWorktree: {
          [WT]: [
            ...(useAppStore
              .getState()
              .unifiedTabsByWorktree[WT]?.filter((tab) => tab.id !== 'tab-b') ?? []),
            {
              id: 'tab-c',
              groupId: 'group-2',
              worktreeId: WT,
              contentType: 'terminal',
              entityId: 'term-c',
              label: 'C',
              customLabel: null,
              color: null,
              sortOrder: 2,
              createdAt: 2
            } satisfies Tab
          ]
        },
        layoutByWorktree: {
          [WT]: {
            type: 'split',
            direction: layoutDirection,
            ratio: 0.5,
            first: sourcePosition === 'first' ? sourceLeaf : targetLeaf,
            second: sourcePosition === 'second' ? sourceLeaf : targetLeaf
          }
        }
      })

      expect(moveActiveTabInDirection(WT, direction)).toBe(true)
      const state = useAppStore.getState()
      expect(state.activeGroupIdByWorktree[WT]).toBe('group-2')
      expect(state.groupsByWorktree[WT]?.find((group) => group.id === 'group-2')).toMatchObject({
        activeTabId: 'tab-a',
        tabOrder: ['tab-c', 'tab-a']
      })
      expect(mocks.mirrorWebRuntimeTabMove).toHaveBeenCalledWith({
        kind: 'move-to-group',
        worktreeId: WT,
        tabId: 'tab-a',
        targetGroupId: 'group-2'
      })
    }
  )

  it.each(['left', 'right', 'up', 'down'] as const)(
    'creates a sibling split pane to the %s and mirrors its direction',
    (direction) => {
      const dropUnifiedTab = vi.fn(() => true)
      useAppStore.setState({ dropUnifiedTab })

      expect(moveActiveTabInDirection(WT, direction)).toBe(true)
      expect(dropUnifiedTab).toHaveBeenCalledWith('tab-a', {
        groupId: 'group-1',
        splitDirection: direction
      })
      expect(mocks.mirrorWebRuntimeTabMove).toHaveBeenCalledWith({
        kind: 'split',
        worktreeId: WT,
        tabId: 'tab-a',
        targetGroupId: 'group-1',
        splitDirection: direction
      })
    }
  )

  it.each([WT, FLOATING_TERMINAL_WORKTREE_ID])(
    'moves the browser tab identified by its page source in %s instead of the stale active tab',
    (worktreeId) => {
      const moveUnifiedTabToGroup = vi.fn(() => true)
      useAppStore.setState({
        moveUnifiedTabToGroup,
        activeGroupIdByWorktree: { [worktreeId]: 'group-2' },
        browserTabsByWorktree: {
          [worktreeId]: [
            {
              id: 'browser-workspace-1',
              worktreeId,
              activePageId: 'browser-page-1',
              pageIds: ['browser-page-1'],
              url: 'https://example.com',
              title: 'Example',
              loading: false,
              faviconUrl: null,
              canGoBack: false,
              canGoForward: false,
              loadError: null,
              createdAt: 1
            } satisfies BrowserWorkspace
          ]
        },
        browserPagesByWorkspace: {
          'browser-workspace-1': [
            {
              id: 'browser-page-1',
              workspaceId: 'browser-workspace-1',
              worktreeId,
              url: 'https://example.com',
              title: 'Example',
              loading: false,
              faviconUrl: null,
              canGoBack: false,
              canGoForward: false,
              loadError: null,
              createdAt: 1
            } satisfies BrowserPage
          ]
        },
        unifiedTabsByWorktree: {
          [worktreeId]: [
            ...(useAppStore.getState().unifiedTabsByWorktree[worktreeId] ?? []),
            {
              id: 'browser-unified-1',
              groupId: 'group-1',
              worktreeId,
              contentType: 'browser',
              entityId: 'browser-workspace-1',
              label: 'Example',
              customLabel: null,
              color: null,
              sortOrder: 2,
              createdAt: 2
            } satisfies Tab
          ]
        },
        groupsByWorktree: {
          [worktreeId]: [
            {
              id: 'group-1',
              worktreeId,
              activeTabId: 'browser-unified-1',
              tabOrder: ['tab-a', 'browser-unified-1']
            },
            {
              id: 'group-2',
              worktreeId,
              activeTabId: 'tab-b',
              tabOrder: ['tab-b']
            }
          ]
        },
        layoutByWorktree: {
          [worktreeId]: {
            type: 'split',
            direction: 'horizontal',
            ratio: 0.5,
            first: { type: 'leaf', groupId: 'group-1' },
            second: { type: 'leaf', groupId: 'group-2' }
          }
        }
      })

      expect(moveBrowserTabInDirection('browser-page-1', 'right')).toBe(true)
      expect(moveUnifiedTabToGroup).toHaveBeenCalledWith('browser-unified-1', 'group-2', {
        activate: true
      })
      expect(mocks.mirrorWebRuntimeTabMove).toHaveBeenCalledWith({
        kind: 'move-to-group',
        worktreeId,
        tabId: 'browser-unified-1',
        targetGroupId: 'group-2'
      })
    }
  )

  it('does not fall back to the ambient active tab for a stale browser source', () => {
    expect(moveBrowserTabInDirection('stale-page', 'right')).toBe(false)
    expect(mocks.mirrorWebRuntimeTabMove).not.toHaveBeenCalled()
  })

  it('does not mirror when the local store rejects the move', () => {
    const dropUnifiedTab = vi.fn(() => false)
    useAppStore.setState({ dropUnifiedTab })

    expect(
      moveTabToNewPaneColumn({ unifiedTabId: 'tab-b', groupId: 'group-1', direction: 'right' })
    ).toBe(false)
    expect(mocks.mirrorWebRuntimeTabMove).not.toHaveBeenCalled()
  })
})
