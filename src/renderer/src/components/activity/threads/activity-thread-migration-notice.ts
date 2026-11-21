import { translate } from '@/i18n/i18n'
import type { ActivityThreadRowCopy } from './activity-thread-presentation'

/** Row copy for a pre-migration terminal that lacks a stable pane identity. */
export function migrationNoticeRowCopy({
  taskTitle,
  workspaceLabel,
  renderedPreview
}: {
  taskTitle: string
  workspaceLabel: string
  renderedPreview: string
}): ActivityThreadRowCopy {
  return {
    taskTitle,
    statusLine:
      renderedPreview ||
      translate(
        'sessionAttention.migrationNoticeDetail',
        'Restart this terminal so Orca can attach a stable pane identity.'
      ),
    statusKind: 'message',
    needsAttention: false,
    workspaceLabel
  }
}
