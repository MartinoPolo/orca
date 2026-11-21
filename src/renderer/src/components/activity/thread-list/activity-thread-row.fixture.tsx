import { defineFixture } from '../../../component-fixtures/component-fixture'
import { ActivityThreadRow } from './activity-thread-row'
import { ActivityThreadHoverCardSummary } from '../thread-preview/activity-thread-hover-card-summary'
import type { AgentPaneThread } from '../threads/activity-thread-types'
import type { Repo } from '../../../../../shared/repository/repo-types'
import { WORK_PROJECT_PRIORITY_SHIFT } from '../../../../../shared/session-effective-priority'

const projectRepo: Repo = {
  id: 'fixture-repo',
  path: '/projects/acme-web',
  displayName: 'acme-web',
  badgeColor: 'var(--muted-foreground)',
  addedAt: 0
}

const workRepo: Repo = {
  id: 'fixture-repo',
  path: '/projects/orca',
  displayName: 'orca',
  badgeColor: '#2563eb',
  repoIcon: { type: 'lucide', name: 'Rocket' },
  addedAt: 0,
  workProject: true
}

function thread(
  minutesAgo: number,
  unread: boolean,
  repo: Repo | null = projectRepo
): AgentPaneThread {
  return {
    paneKey: `activity-fixture-${minutesAgo}`,
    paneTitle: 'Make the agent activity timestamp easier to scan',
    worktree: {
      id: 'activity-fixture',
      repoId: 'fixture-repo',
      path: '/projects/orca/activity-timestamp',
      head: 'abc123',
      branch: 'activity-timestamp',
      isBare: false,
      isMainWorktree: false,
      displayName: 'Activity timestamp',
      comment: '',
      linkedIssue: null,
      linkedPR: null,
      linkedLinearIssue: null,
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: 0,
      lastActivityAt: 0
    },
    repo,
    tab: {
      id: 'fixture-tab',
      ptyId: null,
      worktreeId: 'activity-fixture',
      title: 'Codex',
      customTitle: null,
      color: null,
      sortOrder: 0,
      createdAt: 0
    },
    agentType: 'codex',
    currentAgentState: 'working',
    currentAgentEntry: null,
    responsePreview: 'Checking the activity card layout in light and dark mode.',
    latestTimestamp: Date.now() - minutesAgo * 60_000,
    latestEvent: null,
    events: [],
    unread
  }
}

function ActivityCards({ compactMode = false }: { compactMode?: boolean }) {
  return (
    <div className="space-y-2 bg-background p-2 text-foreground">
      {[thread(2, true, workRepo), thread(125, false, null), thread(3000, false)].map(
        (entry, index) => (
          <ActivityThreadRow
            key={entry.paneKey}
            thread={entry}
            workPriorityShift={entry.repo?.workProject ? WORK_PROJECT_PRIORITY_SHIFT : 0}
            selected={index === 1}
            compactMode={compactMode}
            canJump
            previewSuppressed
            onSelect={() => {}}
            onJump={() => {}}
            onMarkRead={() => {}}
            onClear={() => {}}
          />
        )
      )}
    </div>
  )
}

export const full = defineFixture({
  width: 320,
  render: () => <ActivityCards />
})

export const narrowCompact = defineFixture({
  width: 240,
  render: () => <ActivityCards compactMode />
})

// The hover card body for the first row, framed like the real popover.
export const hoverCard = defineFixture({
  width: 360,
  render: () => (
    <div className="bg-background p-2 text-foreground">
      <div className="w-80 space-y-3 rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground">
        <ActivityThreadHoverCardSummary
          thread={thread(2, true)}
          settings={null}
          canJumpToWorkspace
        />
      </div>
    </div>
  )
})
