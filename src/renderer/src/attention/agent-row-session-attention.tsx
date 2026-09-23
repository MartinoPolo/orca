import React from 'react'
import { useAppStore } from '@/store'
import type { AgentRowSessionAttention } from './use-agent-row-session-attention'
import {
  SessionAttentionContextMenu,
  SessionPriorityBadge,
  SessionSavedMarker,
  SessionUnreadDot
} from './session-attention-components'

export function AgentRowSessionMarkers({
  paneKey,
  sessionName,
  attention,
  className
}: {
  paneKey: string
  sessionName: string
  attention: AgentRowSessionAttention
  className?: string
}): React.JSX.Element | null {
  const acknowledgeAgents = useAppStore((state) => state.acknowledgeAgents)
  if (!attention.isSession) {
    return null
  }
  const markers = (
    <>
      {attention.unread ? (
        <SessionUnreadDot
          sessionName={sessionName}
          onMarkRead={() => acknowledgeAgents([paneKey])}
        />
      ) : null}
      <SessionPriorityBadge priority={attention.priority} />
      {attention.savedColor ? <SessionSavedMarker color={attention.savedColor} /> : null}
    </>
  )
  return className ? <span className={className}>{markers}</span> : markers
}

export function AgentRowSessionAttentionMenu({
  paneKey,
  sessionName,
  attention,
  triggerRef,
  children
}: {
  paneKey: string
  sessionName: string
  attention: AgentRowSessionAttention
  triggerRef: React.RefObject<HTMLElement | null>
  children: React.ReactElement
}): React.JSX.Element {
  const setSessionPriority = useAppStore((state) => state.setSessionPriority)
  const setSessionSavedMarker = useAppStore((state) => state.setSessionSavedMarker)
  const acknowledgeAgents = useAppStore((state) => state.acknowledgeAgents)
  const unacknowledgeAgents = useAppStore((state) => state.unacknowledgeAgents)
  if (!attention.isSession) {
    return children
  }
  return (
    <SessionAttentionContextMenu
      triggerRef={triggerRef}
      sessionIdentity={attention.sessionIdentity}
      sessionName={sessionName}
      priority={attention.priority}
      savedColor={attention.savedColor}
      unread={attention.unread}
      onPriorityChange={setSessionPriority}
      onSavedColorChange={setSessionSavedMarker}
      onMarkRead={() => acknowledgeAgents([paneKey])}
      onMarkUnread={() => unacknowledgeAgents([paneKey])}
    >
      {children}
    </SessionAttentionContextMenu>
  )
}

/** Rows become focusable to anchor the session menu, so Enter/Space must activate them. */
export function activateAgentRowFromKeyboard(event: React.KeyboardEvent<HTMLElement>): void {
  if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault()
    event.currentTarget.click()
  }
}
