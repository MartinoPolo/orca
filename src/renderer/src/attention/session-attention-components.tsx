import React from 'react'
import { Bookmark, BookmarkX, Bell, BellOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import {
  SESSION_PRIORITIES,
  SESSION_SAVED_COLORS,
  type SessionPriority,
  type SessionSavedColor
} from '../../../shared/session-attention'
import type { SessionAttentionTone } from '@/components/activity/session-attention-presentation'

const PRIORITY_MENU_ORDER = SESSION_PRIORITIES.toReversed()

const PRIORITY_VARIANTS = {
  1: 'priorityP1',
  2: 'priorityP2',
  3: 'priorityP3',
  4: 'priorityP4',
  5: 'priorityP5'
} as const

const SAVED_COLOR_CLASSES: Record<SessionSavedColor, string> = {
  blue: 'fill-session-saved-blue text-session-saved-blue',
  violet: 'fill-session-saved-violet text-session-saved-violet',
  teal: 'fill-session-saved-teal text-session-saved-teal',
  rose: 'fill-session-saved-rose text-session-saved-rose'
}

function savedColorLabel(color: SessionSavedColor): string {
  const labels: Record<SessionSavedColor, string> = {
    blue: translate('sessionAttention.savedColor.blue', 'Blue'),
    violet: translate('sessionAttention.savedColor.violet', 'Violet'),
    teal: translate('sessionAttention.savedColor.teal', 'Teal'),
    rose: translate('sessionAttention.savedColor.rose', 'Rose')
  }
  return labels[color]
}

const ATTENTION_SURFACE_CLASSES: Record<Exclude<SessionAttentionTone, null>, string> = {
  input: 'bg-session-attention-input-surface',
  outcome: 'bg-session-attention-outcome-surface',
  done: 'bg-session-attention-done-surface'
}

export function sessionAttentionSurfaceClass(tone: SessionAttentionTone, unread: boolean): string {
  return cn(
    tone ? ATTENTION_SURFACE_CLASSES[tone] : undefined,
    unread && 'ring-2 ring-inset ring-session-attention-unread'
  )
}

export function sessionAttentionMetadataClass(tone: SessionAttentionTone): string | undefined {
  return tone ? 'text-session-attention-metadata' : undefined
}

export function SessionPriorityBadge({
  priority,
  showDefault = false
}: {
  priority: SessionPriority
  showDefault?: boolean
}): React.JSX.Element | null {
  if (priority === 3 && !showDefault) {
    return null
  }
  return (
    <Badge
      variant={PRIORITY_VARIANTS[priority]}
      aria-label={translate('sessionAttention.priority.aria', 'Priority P{{priority}}', {
        priority
      })}
    >
      P{priority}
    </Badge>
  )
}

export function SessionSavedMarker({ color }: { color: SessionSavedColor }): React.JSX.Element {
  const label = savedColorLabel(color)
  const accessibleLabel = translate(
    'sessionAttention.savedMarker.aria',
    'Saved for later, {{color}}',
    { color: label.toLowerCase() }
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex size-3.5 shrink-0 items-center justify-center"
          role="img"
          aria-label={accessibleLabel}
          tabIndex={0}
        >
          <Bookmark className={cn('size-3', SAVED_COLOR_CLASSES[color])} aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {translate('sessionAttention.savedMarker.tooltip', 'Saved for later · {{color}}', {
          color: label
        })}
      </TooltipContent>
    </Tooltip>
  )
}

export function SessionUnreadDot({
  sessionName,
  onMarkRead
}: {
  sessionName: string
  onMarkRead: () => void
}): React.JSX.Element {
  const label = translate(
    'sessionAttention.unread.markRead.aria',
    'Unread — mark read: {{sessionName}}',
    { sessionName }
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="flex size-3.5 shrink-0 cursor-pointer items-center justify-center rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={label}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onMarkRead()
          }}
        >
          <span className="size-2 rounded-full bg-session-attention-unread" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {translate('sessionAttention.unread.markRead.tooltip', 'Mark read')}
      </TooltipContent>
    </Tooltip>
  )
}

function readPriority(value: string): SessionPriority | null {
  const priority = Number(value)
  return SESSION_PRIORITIES.find((candidate) => candidate === priority) ?? null
}

function readSavedColor(value: string): SessionSavedColor | null {
  return SESSION_SAVED_COLORS.find((color) => color === value) ?? null
}

type SessionAttentionContextMenuProps = Omit<
  React.ComponentPropsWithoutRef<typeof ContextMenuTrigger>,
  'asChild'
> & {
  children: React.ReactElement
  triggerRef: React.RefObject<HTMLElement | null>
  sessionIdentity: string | null
  sessionName: string
  priority: SessionPriority
  savedColor?: SessionSavedColor
  unread: boolean
  markUnreadDisabled?: boolean
  onPriorityChange: (identity: string, priority: SessionPriority) => void
  onSavedColorChange: (identity: string, color: SessionSavedColor | null) => void
  onMarkRead: () => void
  onMarkUnread: () => void
}

// Radix triggers compose through this wrapper in Activity rows. Forwarding the injected
// trigger props and ref keeps the actual row DOM as both the hover and context-menu anchor.
export const SessionAttentionContextMenu: React.ForwardRefExoticComponent<
  SessionAttentionContextMenuProps & React.RefAttributes<HTMLElement>
> = React.forwardRef<HTMLElement, SessionAttentionContextMenuProps>(
  function SessionAttentionContextMenu(
    {
      children,
      triggerRef,
      sessionIdentity,
      sessionName,
      priority,
      savedColor,
      unread,
      markUnreadDisabled = false,
      onPriorityChange,
      onSavedColorChange,
      onMarkRead,
      onMarkUnread,
      ...triggerProps
    },
    forwardedRef
  ): React.JSX.Element {
    const restoreFocus = (): void => {
      requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }))
    }

    return (
      <ContextMenu>
        <ContextMenuTrigger ref={forwardedRef} asChild {...triggerProps}>
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent
          className="w-56"
          aria-label={translate(
            'sessionAttention.contextMenu.aria',
            'Session actions for {{sessionName}}',
            { sessionName }
          )}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            restoreFocus()
          }}
        >
          {sessionIdentity ? (
            <>
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  {translate('sessionAttention.contextMenu.priority', 'Priority')}
                </ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  <ContextMenuRadioGroup
                    value={String(priority)}
                    onValueChange={(value) => {
                      const next = readPriority(value)
                      if (next !== null) {
                        onPriorityChange(sessionIdentity, next)
                      }
                    }}
                  >
                    {PRIORITY_MENU_ORDER.map((value) => (
                      <ContextMenuRadioItem key={value} value={String(value)}>
                        <SessionPriorityBadge priority={value} showDefault />
                        {value === 3
                          ? translate('sessionAttention.priority.default', 'Default')
                          : null}
                      </ContextMenuRadioItem>
                    ))}
                  </ContextMenuRadioGroup>
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  {translate('sessionAttention.contextMenu.savedMarker', 'Saved marker')}
                </ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  <ContextMenuRadioGroup
                    value={savedColor ?? ''}
                    onValueChange={(value) => {
                      const next = readSavedColor(value)
                      if (next !== null) {
                        onSavedColorChange(sessionIdentity, next)
                      }
                    }}
                  >
                    {SESSION_SAVED_COLORS.map((color) => (
                      <ContextMenuRadioItem key={color} value={color}>
                        <SessionSavedMarker color={color} />
                        {savedColorLabel(color)}
                      </ContextMenuRadioItem>
                    ))}
                  </ContextMenuRadioGroup>
                  {savedColor ? (
                    <>
                      <ContextMenuSeparator />
                      <ContextMenuItem onSelect={() => onSavedColorChange(sessionIdentity, null)}>
                        <BookmarkX />
                        {translate(
                          'sessionAttention.contextMenu.removeSavedMarker',
                          'Remove saved marker'
                        )}
                      </ContextMenuItem>
                    </>
                  ) : null}
                </ContextMenuSubContent>
              </ContextMenuSub>
            </>
          ) : (
            <ContextMenuItem disabled>
              {translate(
                'sessionAttention.contextMenu.preferencesUnavailable',
                'Session preferences unavailable until the provider reports a stable session identity'
              )}
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem
            disabled={!unread && markUnreadDisabled}
            onSelect={unread ? onMarkRead : onMarkUnread}
          >
            {unread ? <BellOff /> : <Bell />}
            {unread
              ? translate('sessionAttention.contextMenu.markRead', 'Mark read')
              : translate('sessionAttention.contextMenu.markUnread', 'Mark unread')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )
  }
)
