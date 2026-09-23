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
