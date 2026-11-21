import React from 'react'
import { ExternalLink, Folder, X } from 'lucide-react'
import { AgentTypeIcon } from '@/components/agent/icons/agent-type-icon'
import { formatAgentTypeLabel } from '../../../../../shared/agent-status/presentation/agent-type-label'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { RepoIconGlyph } from '@/components/repo/repo-icon'
import { resolveRepoHeaderColor } from '@/components/sidebar/worktree-list/rows/project-header-color'
import type { Repo } from '../../../../../shared/repository/repo-types'
import { DEFAULT_SESSION_PRIORITY } from '../../../../../shared/session-effective-priority'
import '../../sidebar/workspace-card/activity/worktree-card-empty-inputs'
import CommentMarkdown from '../../comment-markdown/CommentMarkdown'
import { EventTime, ThreadAgentStateIndicator } from './activity-thread-controls'
import { ActivityThreadHoverCard } from '../thread-preview/activity-thread-hover-card'
import {
  activityThreadRowCopy,
  activityThreadRowIdentity,
  activityThreadStatusId
} from '../threads/activity-thread-presentation'
import { ProjectChip } from '@/components/repo/project-chip'
import type { ActivityGroupBy } from '../../../../../shared/agent-status/presentation/agents-view-thread-filters'
import type { AgentPaneThread } from '../threads/activity-thread-types'
import type { ActivityThreadClickEvent } from './use-activity-thread-selection'
import { sessionAttentionTone } from '../threads/session-attention-presentation'
import {
  SessionPriorityBadge,
  SessionSavedMarker,
  SessionUnreadDot,
  SessionWorkPriorityShiftChip,
  sessionAttentionMetadataClass,
  sessionAttentionSurfaceClass
} from '@/attention/session-attention-components'

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
          data-activity-thread-control=""
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

function ActivityThreadProjectIcon({ repo }: { repo: Repo | null }): React.JSX.Element {
  const t = useTranslate()
  const label = repo
    ? repo.displayName
    : t('auto.components.activity.ActivityThreadRow.noProject', 'No project')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="mr-1 inline-flex shrink-0 align-[-2px]" role="img" aria-label={label}>
          {repo ? (
            <RepoIconGlyph
              repoIcon={repo.repoIcon}
              color={resolveRepoHeaderColor(repo.badgeColor)}
              className="size-3.25 shrink-0"
              iconClassName="size-3.25"
            />
          ) : (
            <Folder className="size-3.25 text-muted-foreground" aria-hidden />
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

// Stable thread/callback identities let memoized rows skip query, selection and grouping updates.
export const ActivityThreadRow = React.memo(function ActivityThreadRow({
  thread,
  workPriorityShift,
  selected,
  multiSelected = false,
  onSelect,
  onJump,
  onMarkRead,
  onClear,
  canJump,
  compactMode,
  showJumpAction = true,
  previewSuppressed = false,
  groupBy = 'none'
}: {
  thread: AgentPaneThread
  /** Work switch offset applied to this row's stored priority, from the list's grouping. */
  workPriorityShift: number
  selected: boolean
  /** In the multi-selection and not the open row. */
  multiSelected?: boolean
  onSelect: (thread: AgentPaneThread, event: ActivityThreadClickEvent) => void
  onJump: (thread: AgentPaneThread) => void
  onMarkRead: (thread: AgentPaneThread) => void
  onClear?: (thread: AgentPaneThread) => void
  canJump: boolean
  compactMode: boolean
  showJumpAction?: boolean
  previewSuppressed?: boolean
  groupBy?: ActivityGroupBy
}): React.JSX.Element {
  const t = useTranslate()
  useUiLanguageRevision()
  const { taskTitle, statusLine, statusKind, needsAttention, workspaceLabel } =
    activityThreadRowCopy(thread, t)
  const { showProject, showWorkspace } = activityThreadRowIdentity(thread, groupBy)
  const showMarkdownStatus = statusKind === 'message'
  const agentLabel = formatAgentTypeLabel(thread.agentType)
  const attentionTone =
    thread.migrationUnsupportedPtyId === undefined
      ? sessionAttentionTone({ status: activityThreadStatusId(thread), unread: thread.unread })
      : null

  return (
    <ActivityThreadHoverCard
      thread={thread}
      onJumpToWorkspace={onJump}
      canJumpToWorkspace={canJump}
      suppressed={previewSuppressed}
    >
      <div
        data-current={selected ? 'true' : undefined}
        data-worktree-card-surface="true"
        data-worktree-card-active={selected ? 'primary' : undefined}
        data-worktree-card-selected={multiSelected || undefined}
        onClick={(event) => onSelect(thread, event)}
        role="listitem"
        aria-label={taskTitle}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'group relative flex w-full cursor-pointer flex-col gap-1 rounded-lg border border-transparent px-1.5 py-1.5 text-left transition-[background-color,border-color,opacity,box-shadow] duration-200 outline-none select-none worktree-sidebar-card-hover focus-visible:ring-1 focus-visible:ring-ring',
          sessionAttentionSurfaceClass(attentionTone, thread.unread)
        )}
      >
        <div className="flex min-w-0 items-start gap-1.5">
          <span className="mt-0.5 inline-flex shrink-0">
            <ThreadAgentStateIndicator thread={thread} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex min-w-0 items-start gap-2">
              {/* Keep the activation target separate from markdown links and row actions. */}
              <button
                type="button"
                aria-label={taskTitle}
                aria-keyshortcuts="Enter Space"
                onClick={(event) => {
                  event.stopPropagation()
                  onSelect(thread, event)
                }}
                className={cn(
                  'block min-w-0 flex-1 cursor-pointer text-left text-[13px] leading-5 outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  compactMode ? 'truncate' : 'line-clamp-2 break-words',
                  thread.unread ? 'font-semibold text-foreground' : 'font-medium text-foreground'
                )}
              >
                <ActivityThreadProjectIcon repo={thread.repo} />
                {taskTitle}
              </button>
              <EventTime
                timestamp={thread.latestTimestamp}
                compact
                className="shrink-0 whitespace-nowrap py-0.5 text-xs font-medium text-foreground/60 hover:text-foreground/60"
              />
            </div>

            {statusLine ? (
              showMarkdownStatus ? (
                <CommentMarkdown
                  content={statusLine}
                  singleTildeStrikethrough={false}
                  className={cn(
                    'min-w-0 break-words text-[13px] leading-5 text-foreground/80',
                    compactMode ? 'line-clamp-2' : 'line-clamp-3',
                    '[&_*]:!m-0 [&_*]:!p-0 [&_br]:hidden [&_ol]:list-none [&_ul]:list-none',
                    // Why: code blocks and tables otherwise render as scroll boxes the line clamp cannot cut.
                    '[&_pre]:!max-h-none [&_pre]:!overflow-visible [&_pre]:!whitespace-normal [&_pre]:!rounded-none [&_pre]:!bg-transparent [&_pre]:![font:inherit] [&_pre_code]:![font:inherit]',
                    '[&_div]:!overflow-visible [&_:is(table,thead,tbody,tr,th,td)]:!inline [&_:is(table,thead,tbody,tr,th,td)]:!align-baseline [&_:is(th,td)]:!border-0 [&_:is(th,td)]:!pr-2 [&_table]:![font:inherit]'
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
                'flex min-w-0 items-center gap-2 pt-0.5 text-[11px] text-muted-foreground',
                sessionAttentionMetadataClass(attentionTone)
              )}
            >
              <span className="inline-flex shrink-0" title={agentLabel}>
                <AgentTypeIcon agentType={thread.agentType} size={13} />
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                {showProject && thread.repo ? (
                  // Why: the workspace name yields width first, keeping a few characters visible.
                  <ProjectChip
                    repo={thread.repo}
                    className={showWorkspace ? 'max-w-[calc(100%-3rem)]' : 'max-w-full'}
                  />
                ) : null}
                {showWorkspace ? (
                  <span className="min-w-0 truncate" title={workspaceLabel}>
                    {workspaceLabel}
                  </span>
                ) : null}
              </span>
              {thread.unread ? (
                <SessionUnreadDot sessionName={taskTitle} onMarkRead={() => onMarkRead(thread)} />
              ) : null}
              <SessionPriorityBadge priority={thread.priority ?? DEFAULT_SESSION_PRIORITY} />
              <SessionWorkPriorityShiftChip shift={workPriorityShift} />
              {thread.savedMarker?.savedColor ? (
                <SessionSavedMarker color={thread.savedMarker.savedColor} />
              ) : null}
              <TooltipProvider delayDuration={800} skipDelayDuration={0}>
                {canJump && showJumpAction ? (
                  <ActivityThreadRowAction
                    label={t(
                      'auto.components.activity.ActivityPrototypePage.4616ea39fd',
                      'Jump to workspace'
                    )}
                    onClick={() => onJump(thread)}
                  >
                    <ExternalLink className="size-2.75" />
                  </ActivityThreadRowAction>
                ) : null}
                {onClear ? (
                  <ActivityThreadRowAction
                    label={t(
                      'auto.components.activity.ActivityThreadRow.clearNotification',
                      'Clear notification'
                    )}
                    keyboardReachable
                    onClick={() => onClear(thread)}
                  >
                    <X className="size-2.75" />
                  </ActivityThreadRowAction>
                ) : null}
              </TooltipProvider>
            </div>
          </div>
        </div>
        {/* Fills while the pointer rests; the hover card sets the attribute. Duration = rest minus progress delay. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-2 bottom-0 h-px origin-left scale-x-0 rounded-full bg-muted-foreground/50 group-data-[hover-card-resting]:scale-x-100 group-data-[hover-card-resting]:transition-transform group-data-[hover-card-resting]:duration-400 group-data-[hover-card-resting]:ease-linear motion-reduce:hidden"
        />
      </div>
    </ActivityThreadHoverCard>
  )
})
