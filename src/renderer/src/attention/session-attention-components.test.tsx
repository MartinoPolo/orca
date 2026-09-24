/** @vitest-environment happy-dom */
import { createRef } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  SessionAttentionContextMenu,
  SessionSavedMarker,
  SessionUnreadDot
} from './session-attention-components'
import { TooltipProvider } from '@/components/ui/tooltip'
import { buildActivityThreadGroups } from '@/components/activity/activity-thread-grouping'
import { ActivityThreadRow } from '@/components/activity/activity-thread-row'
import type { AgentPaneThread } from '@/components/activity/activity-thread-types'
import type { SessionPriority } from '../../../shared/session-attention'
import { useAppStore } from '@/store'
import {
  makeTabWithIds,
  makeWorktree
} from '@/components/activity/ActivityPrototypePage-test-fixtures'
import WorktreeContextMenu from '@/components/sidebar/WorktreeContextMenu'

function renderMenu(onMarkUnread = vi.fn(), onPriorityChange = vi.fn()) {
  const triggerRef = createRef<HTMLButtonElement>()
  render(
    <SessionAttentionContextMenu
      triggerRef={triggerRef}
      sessionIdentity="stable-session"
      sessionName="Session one"
      priority={3}
      unread={false}
      onPriorityChange={onPriorityChange}
      onSavedColorChange={vi.fn()}
      onMarkRead={vi.fn()}
      onMarkUnread={onMarkUnread}
    >
      <button ref={triggerRef} type="button">
        Session one
      </button>
    </SessionAttentionContextMenu>
  )
  return { triggerRef, onMarkUnread, onPriorityChange }
}

describe('session attention markers', () => {
  it('uses the unread dot as the sole interactive mark-read control', () => {
    const onMarkRead = vi.fn()
    render(
      <TooltipProvider>
        <SessionUnreadDot sessionName="Session one" onMarkRead={onMarkRead} />
      </TooltipProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Unread — mark read: Session one' }))
    expect(onMarkRead).toHaveBeenCalledOnce()
  })

  it('uses a keyboard-accessible tooltip instead of a title for saved markers', () => {
    const { container } = render(
      <TooltipProvider>
        <SessionSavedMarker color="teal" />
      </TooltipProvider>
    )
    expect(container.querySelector('[title]')).toBeNull()
    expect(
      screen.getByRole('img', { name: 'Saved for later, teal' }).getAttribute('data-state')
    ).toBe('closed')
  })
})

describe('SessionAttentionContextMenu', () => {
  it('restores focus to the invoking row after a read-state action that can reorder it', async () => {
    const { triggerRef, onMarkUnread } = renderMenu()
    fireEvent.contextMenu(triggerRef.current!)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Mark unread' }))

    expect(onMarkUnread).toHaveBeenCalledOnce()
    await waitFor(() => expect(document.activeElement).toBe(triggerRef.current))
  })

  it('opens from a real Activity row and restores focus after store-derived priority reorder', async () => {
    const worktree = makeWorktree()
    const onSelect = vi.fn()
    const makeThread = (paneKey: string, priority: SessionPriority): AgentPaneThread => ({
      paneKey,
      paneTitle: paneKey,
      worktree,
      repo: null,
      tab: makeTabWithIds(paneKey, worktree.id),
      agentType: 'claude',
      currentAgentState: 'waiting',
      currentAgentEntry: null,
      responsePreview: '',
      latestTimestamp: 1,
      latestEvent: null,
      events: [],
      unread: false,
      sessionIdentity: paneKey,
      priority,
      savedMarker: null,
      attentionStartedAt: 1,
      attentionEligible: true
    })
    useAppStore.setState({
      sessionAttentionMetadataByIdentity: {
        target: { priority: 3 },
        sibling: { priority: 4 }
      }
    })

    function ActivityQueue(): React.JSX.Element {
      const metadata = useAppStore((state) => state.sessionAttentionMetadataByIdentity)
      const threads = buildActivityThreadGroups(
        [makeThread('target', metadata.target?.priority ?? 3), makeThread('sibling', 4)],
        'status'
      )[0].threads
      return (
        <TooltipProvider>
          <div role="list">
            {threads.map((thread) => (
              <ActivityThreadRow
                key={thread.paneKey}
                thread={thread}
                selected={false}
                onSelect={onSelect}
                onJump={vi.fn()}
                onMarkRead={vi.fn()}
                onMarkUnread={vi.fn()}
                canJump={false}
                compactMode
              />
            ))}
          </div>
        </TooltipProvider>
      )
    }

    const { container } = render(<ActivityQueue />)
    const targetRow = screen.getByRole('listitem', { name: 'target' })
    fireEvent.contextMenu(targetRow)
    const priorityItem = await screen.findByRole('menuitem', { name: 'Priority' })
    fireEvent.keyDown(priorityItem, { key: 'ArrowRight' })
    fireEvent.click(await screen.findByText('P5'))

    expect(useAppStore.getState().sessionAttentionMetadataByIdentity.target?.priority).toBe(5)
    expect(container.querySelector('[role="listitem"]')?.getAttribute('aria-label')).toBe('target')
    expect(onSelect).not.toHaveBeenCalled()
    await waitFor(() => expect(document.activeElement).toBe(targetRow))
  })

  it('owns right-clicks when nested inside a workspace context menu', async () => {
    const triggerRef = createRef<HTMLButtonElement>()
    const onWorkspaceContextMenuSelect = vi.fn(() => [makeWorktree()])
    const onWorkspaceMenuOpenChange = vi.fn()
    render(
      <WorktreeContextMenu
        worktree={makeWorktree()}
        onContextMenuSelect={onWorkspaceContextMenuSelect}
        onOpenChange={onWorkspaceMenuOpenChange}
      >
        <SessionAttentionContextMenu
          triggerRef={triggerRef}
          sessionIdentity="nested-session"
          sessionName="Nested session"
          priority={3}
          unread={false}
          onPriorityChange={vi.fn()}
          onSavedColorChange={vi.fn()}
          onMarkRead={vi.fn()}
          onMarkUnread={vi.fn()}
        >
          <button ref={triggerRef} type="button">
            Nested session
          </button>
        </SessionAttentionContextMenu>
      </WorktreeContextMenu>
    )

    fireEvent.contextMenu(triggerRef.current!)

    expect(await screen.findByRole('menuitem', { name: 'Priority' })).toBeTruthy()
    expect(screen.queryByText('Workspace')).toBeNull()
    expect(onWorkspaceContextMenuSelect).not.toHaveBeenCalled()
    expect(onWorkspaceMenuOpenChange).not.toHaveBeenCalled()
  })

  it('opens a real Activity row context menu with Shift+F10', async () => {
    const worktree = makeWorktree()
    const thread: AgentPaneThread = {
      paneKey: 'keyboard-target',
      paneTitle: 'Keyboard target',
      worktree,
      repo: null,
      tab: makeTabWithIds('keyboard-target', worktree.id),
      agentType: 'claude',
      currentAgentState: 'waiting',
      currentAgentEntry: null,
      responsePreview: '',
      latestTimestamp: 1,
      latestEvent: null,
      events: [],
      unread: false,
      sessionIdentity: 'keyboard-target',
      priority: 3
    }
    render(
      <TooltipProvider>
        <ActivityThreadRow
          thread={thread}
          selected={false}
          onSelect={vi.fn()}
          onJump={vi.fn()}
          onMarkRead={vi.fn()}
          onMarkUnread={vi.fn()}
          canJump={false}
          compactMode
        />
      </TooltipProvider>
    )

    fireEvent.keyDown(screen.getByRole('listitem', { name: 'Keyboard target' }), {
      key: 'F10',
      shiftKey: true
    })
    expect(await screen.findByRole('menuitem', { name: 'Priority' })).toBeTruthy()
  })

  it('explains why durable controls are unavailable without stable session identity', async () => {
    const triggerRef = createRef<HTMLButtonElement>()
    render(
      <SessionAttentionContextMenu
        triggerRef={triggerRef}
        sessionIdentity={null}
        sessionName="Pending session"
        priority={3}
        unread={false}
        onPriorityChange={vi.fn()}
        onSavedColorChange={vi.fn()}
        onMarkRead={vi.fn()}
        onMarkUnread={vi.fn()}
      >
        <button ref={triggerRef} type="button">
          Pending session
        </button>
      </SessionAttentionContextMenu>
    )
    fireEvent.contextMenu(triggerRef.current!)
    expect(
      await screen.findByText(/unavailable until the provider reports a stable session identity/i)
    ).toBeTruthy()
  })
})
