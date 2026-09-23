import React, { useRef } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { AgentIcon } from '@/lib/agent-catalog'
import { agentTypeToIconAgent, formatAgentTypeLabel } from '@/lib/agent-status'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import CommentMarkdown from '../sidebar/CommentMarkdown'
import { EventTime, ThreadAgentStateIndicator } from './activity-thread-controls'
import { ActivityThreadHoverCard } from './activity-thread-hover-card'
import { activityThreadRowCopy, activityThreadStatusId } from './activity-thread-presentation'
import type { AgentPaneThread } from './activity-thread-types'
import { sessionAttentionTone } from './session-attention-presentation'
import {
  SessionAttentionContextMenu,
  SessionPriorityBadge,
  SessionSavedMarker,
  SessionUnreadDot,
  sessionAttentionMetadataClass,
  sessionAttentionSurfaceClass
} from '@/attention/session-attention-components'
import { useAppStore } from '@/store'

function ActivityThreadRowAction({
  label,
  onClick,
  keyboardReachable = false,
  children
}: {
  label: string
  onClick: () => void
  // Hover-only actions stay `invisible` so long lists don't gain a tab stop per row.
  keyboardReachable?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={cn(
            'size-4 p-0 text-muted-foreground transition-opacity hover:text-foreground can-hover:pointer-events-none can-hover:opacity-0 can-hover:group-hover:pointer-events-auto can-hover:group-hover:opacity-100 focus-visible:opacity-100',
            !keyboardReachable && 'can-hover:invisible can-hover:group-hover:visible'
          )}
          aria-label={label}
          onClick={(event) => {
            event.stopPropagation()
            onClick()
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  )
}

// Why React.memo: rows are pure functions of these props; thread identity is stable across
// query/selection/group re-renders, so memo keeps a keystroke or selection change from
// re-rendering every mounted row. Callbacks take the thread so parents can pass stable handlers.
export const ActivityThreadRow = React.memo(function ActivityThreadRow({
  thread,
  selected,
  onSelect,
  onJump,
  onMarkRead,
  onMarkUnread,
  onClear,
  canJump,
  compactMode,
  disableMarkUnread = false,
  showJumpAction = true
}: {
  thread: AgentPaneThread
  selected: boolean
  onSelect: (thread: AgentPaneThread) => void
  onJump: (thread: AgentPaneThread) => void
  onMarkRead: (thread: AgentPaneThread) => void
  onMarkUnread: (thread: AgentPaneThread) => void
  onClear?: (thread: AgentPaneThread) => void
  canJump: boolean
  compactMode: boolean
  disableMarkUnread?: boolean
  showJumpAction?: boolean
}): React.JSX.Element {
  const { taskTitle, statusLine, statusKind, needsAttention, workspaceLabel } =
    activityThreadRowCopy(thread)
  const showMarkdownStatus = statusKind === 'message'
  const agentLabel = formatAgentTypeLabel(thread.agentType)
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const setSessionPriority = useAppStore((state) => state.setSessionPriority)
  const setSessionSavedMarker = useAppStore((state) => state.setSessionSavedMarker)
  const attentionTone =
    thread.migrationUnsupportedPtyId === undefined
      ? sessionAttentionTone({
          status: activityThreadStatusId(thread),
          unread: thread.unread
        })
      : null

  return (
    <ActivityThreadHoverCard
      thread={thread}
      onJumpToWorkspace={onJump}
      canJumpToWorkspace={canJump}
    >
      <SessionAttentionContextMenu
        triggerRef={triggerRef}
        sessionIdentity={thread.sessionIdentity ?? null}
        sessionName={taskTitle}
        priority={thread.priority ?? 3}
        savedColor={thread.savedMarker?.savedColor}
        unread={thread.unread}
        markUnreadDisabled={disableMarkUnread}
        onPriorityChange={setSessionPriority}
        onSavedColorChange={setSessionSavedMarker}
        onMarkRead={() => onMarkRead(thread)}
        onMarkUnread={() => onMarkUnread(thread)}
      >
        <div
          ref={triggerRef}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) {
              return
            }
            if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
              event.preventDefault()
              event.currentTarget.dispatchEvent(
                new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
              )
              return
            }
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onSelect(thread)
            }
          }}
          data-current={selected ? 'true' : undefined}
          data-worktree-card-surface="true"
          data-worktree-card-active={selected ? 'primary' : undefined}
          onClick={() => onSelect(thread)}
          role="listitem"
          aria-label={taskTitle}
          aria-current={selected ? 'true' : undefined}
          className={cn(
            'group relative flex w-full cursor-pointer flex-col gap-1 rounded-lg border border-transparent px-1.5 py-1.5 text-left outline-none select-none worktree-sidebar-card-hover',
            sessionAttentionSurfaceClass(attentionTone, thread.unread),
            selected && 'border-transparent bg-worktree-sidebar-accent'
          )}
        >
          <div className="flex min-w-0 items-start gap-1.5">
            <span className="mt-0.5 inline-flex shrink-0">
              <ThreadAgentStateIndicator thread={thread} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {/* Keep the activation target separate from markdown links and row actions. */}
              <button
                type="button"
                aria-label={taskTitle}
                aria-keyshortcuts="Enter Space"
                onClick={(event) => {
                  event.stopPropagation()
                  onSelect(thread)
                }}
                className={cn(
                  'block min-w-0 w-full cursor-pointer text-left text-[13px] leading-5 outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  compactMode ? 'truncate' : 'line-clamp-2 break-words',
                  thread.unread ? 'font-semibold text-foreground' : 'font-medium text-foreground'
                )}
              >
                {taskTitle}
              </button>

              {statusLine ? (
                showMarkdownStatus ? (
                  <CommentMarkdown
                    content={statusLine}
                    className={cn(
                      'min-w-0 break-words text-[13px] leading-5 text-foreground/80',
                      compactMode ? 'line-clamp-2' : 'line-clamp-3',
                      '[&_*]:!m-0 [&_*]:!p-0 [&_br]:hidden [&_ol]:list-none [&_ul]:list-none'
                    )}
                  />
                ) : (
                  <div
                    className={cn(
                      'min-w-0 break-words text-[13px] leading-5',
                      compactMode ? 'line-clamp-2' : 'line-clamp-3',
                      needsAttention ? 'text-agent-question-text' : 'text-foreground/80'
                    )}
                  >
                    {statusLine}
                  </div>
                )
              ) : null}

              <div
                className={cn(
                  'flex min-w-0 items-center gap-1.5 pt-0.5 text-[11px] text-muted-foreground',
                  sessionAttentionMetadataClass(attentionTone)
                )}
              >
                <span className="inline-flex shrink-0" title={agentLabel}>
                  <AgentIcon agent={agentTypeToIconAgent(thread.agentType)} size={13} />
                </span>
                <span className="min-w-0 flex-1 truncate" title={workspaceLabel}>
                  {workspaceLabel}
                </span>
                {thread.unread ? (
                  <SessionUnreadDot sessionName={taskTitle} onMarkRead={() => onMarkRead(thread)} />
                ) : null}
                <SessionPriorityBadge priority={thread.priority ?? 3} />
                {thread.savedMarker?.savedColor ? (
                  <SessionSavedMarker color={thread.savedMarker.savedColor} />
                ) : null}
                {canJump && showJumpAction ? (
                  <ActivityThreadRowAction
                    label={translate(
                      'auto.components.activity.ActivityPrototypePage.4616ea39fd',
                      'Jump to workspace'
                    )}
                    onClick={() => onJump(thread)}
                  >
                    <ExternalLink className="size-2.5" />
                  </ActivityThreadRowAction>
                ) : null}
                {onClear ? (
                  <ActivityThreadRowAction
                    label={translate(
                      'auto.components.activity.ActivityThreadRow.clearNotification',
                      'Clear notification'
                    )}
                    keyboardReachable
                    onClick={() => onClear(thread)}
                  >
                    <X className="size-2.5" />
                  </ActivityThreadRowAction>
                ) : null}
                <EventTime timestamp={thread.latestTimestamp} compact />
              </div>
            </div>
          </div>
        </div>
      </SessionAttentionContextMenu>
    </ActivityThreadHoverCard>
  )
})
