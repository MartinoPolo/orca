// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FolderWorkspace } from '../../../../shared/folder-workspace-types'
import type { ProjectGroup } from '../../../../shared/project-group-types'
import type * as NewWorkspaceModule from '@/lib/new-workspace'

const mocks = vi.hoisted(() => ({
  activateAndRevealFolderWorkspace: vi.fn(),
  ensureAgentStartupInTerminal: vi.fn()
}))

vi.mock('@/lib/worktree-activation', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, activateAndRevealFolderWorkspace: mocks.activateAndRevealFolderWorkspace }
})

vi.mock('@/lib/new-workspace', async (importOriginal) => {
  const actual = await importOriginal<typeof NewWorkspaceModule>()
  return {
    ...actual,
    ensureAgentStartupInTerminal: mocks.ensureAgentStartupInTerminal
  }
})

import { decideInitialAgentTabViewMode } from '@/lib/native-chat-initial-view-mode'
import { resolveStartupLaunchDraftText } from '@/lib/worktree-startup-payload'
import { useAppStore } from '@/store'
import { submitFolderWorkspaceCreate } from './folder-workspace-composer-submit'

const ISSUE_URL = 'https://github.com/stablyai/orca/issues/42'
const linkedIssue = {
  provider: 'github' as const,
  type: 'issue' as const,
  number: 42,
  title: 'Restore linked quick-create',
  url: ISSUE_URL,
  repoId: 'repo-1'
}

function makeProjectGroup(): ProjectGroup {
  return {
    id: 'group-1',
    name: 'Platform',
    parentPath: '/repo/platform',
    parentGroupId: null,
    createdFrom: 'folder-scan',
    tabOrder: 0,
    isCollapsed: false,
    color: null,
    createdAt: 1,
    updatedAt: 1
  }
}

function makeFolderWorkspace(): FolderWorkspace {
  return {
    id: 'folder-workspace-1',
    projectGroupId: 'group-1',
    name: 'hi',
    folderPath: '/repo/platform/hi',
    linkedTask: null,
    comment: '',
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 1,
    createdAt: 1,
    updatedAt: 1
  }
}

function seededDraftFor(tabId: string): { text: string } | undefined {
  return useAppStore.getState().nativeChatLaunchDraftByTabId[tabId]
}

describe('submitFolderWorkspaceCreate native-chat launch draft', () => {
  beforeEach(() => {
    mocks.activateAndRevealFolderWorkspace.mockReturnValue({ primaryTabId: 'tab-1' })
    useAppStore.setState({ nativeChatLaunchDraftByTabId: {} })
    Object.assign(window, {
      api: { agentTrust: { markTrusted: vi.fn().mockResolvedValue(undefined) } }
    })
  })

  afterEach(() => {
    mocks.activateAndRevealFolderWorkspace.mockReset()
    mocks.ensureAgentStartupInTerminal.mockReset()
    useAppStore.setState({ nativeChatLaunchDraftByTabId: {} })
    Reflect.deleteProperty(window, 'api')
    vi.restoreAllMocks()
  })

  it('mirrors a startup-paste draft into the chat composer', async () => {
    await submitFolderWorkspaceCreate({
      projectGroup: makeProjectGroup(),
      name: '',
      lastAutoName: '',
      linkedWorkItem: linkedIssue,
      note: '',
      quickAgent: 'codex',
      autoRenameBranchFromWork: false,
      agentCmdOverrides: {},
      createFolderWorkspace: vi.fn(async () => makeFolderWorkspace()),
      onOpenChange: vi.fn()
    })

    expect(seededDraftFor('tab-1')?.text).toBe(ISSUE_URL)
  })

  it('uses the same configured Pi template for native prefill and transported draft', async () => {
    const configuredDraft = `/skill:mpx-execute ${ISSUE_URL}`
    await submitFolderWorkspaceCreate({
      projectGroup: makeProjectGroup(),
      name: '',
      lastAutoName: '',
      linkedWorkItem: linkedIssue,
      note: '',
      quickAgent: 'pi',
      autoRenameBranchFromWork: false,
      agentCmdOverrides: {},
      linkedWorkItemPromptTemplate: '/skill:mpx-execute {{artifact_url}}',
      createFolderWorkspace: vi.fn(async () => makeFolderWorkspace()),
      onOpenChange: vi.fn()
    })

    const startup = mocks.activateAndRevealFolderWorkspace.mock.calls[0]?.[1]?.startup
    expect(startup?.env?.ORCA_PI_PREFILL).toBe(configuredDraft)
    expect(startup?.launchDraftText).toBe(configuredDraft)
  })

  it('mirrors an argv-prefill draft, which never lands in startupPlan.draftPrompt', async () => {
    await submitFolderWorkspaceCreate({
      projectGroup: makeProjectGroup(),
      name: '',
      lastAutoName: '',
      linkedWorkItem: linkedIssue,
      note: '',
      quickAgent: 'claude',
      autoRenameBranchFromWork: false,
      agentCmdOverrides: {},
      createFolderWorkspace: vi.fn(async () => makeFolderWorkspace()),
      onOpenChange: vi.fn()
    })

    const startup = mocks.activateAndRevealFolderWorkspace.mock.calls[0]?.[1]?.startup
    expect(startup?.draftPrompt).toBeUndefined()
    expect(startup?.command).toContain(ISSUE_URL)
    expect(seededDraftFor('tab-1')?.text).toBe(ISSUE_URL)
  })

  it('mirrors a multi-line draft into chat', async () => {
    await submitFolderWorkspaceCreate({
      projectGroup: makeProjectGroup(),
      name: '',
      lastAutoName: '',
      linkedWorkItem: linkedIssue,
      note: 'Reproduce on Windows first',
      quickAgent: 'codex',
      autoRenameBranchFromWork: false,
      agentCmdOverrides: {},
      createFolderWorkspace: vi.fn(async () => makeFolderWorkspace()),
      onOpenChange: vi.fn()
    })

    expect(mocks.ensureAgentStartupInTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        startup: expect.objectContaining({
          draftPrompt: `Reproduce on Windows first\n\n${ISSUE_URL}`
        })
      })
    )
    expect(seededDraftFor('tab-1')?.text).toBe(`Reproduce on Windows first\n\n${ISSUE_URL}`)
  })

  it('does not mirror an unlinked note, which is submitted rather than drafted', async () => {
    await submitFolderWorkspaceCreate({
      projectGroup: makeProjectGroup(),
      name: '',
      lastAutoName: '',
      linkedWorkItem: null,
      note: 'Fix the flaky checkout flow',
      quickAgent: 'codex',
      autoRenameBranchFromWork: false,
      agentCmdOverrides: {},
      createFolderWorkspace: vi.fn(async () => makeFolderWorkspace()),
      onOpenChange: vi.fn()
    })

    expect(seededDraftFor('tab-1')).toBeUndefined()
  })

  // Why: argv-prefill and startup-paste drafts must agree with the chat-opening gate.
  it.each([
    ['argv-prefill', 'claude' as const, '', true],
    ['argv-prefill multi-line', 'claude' as const, 'Reproduce on Windows first', true],
    ['startup-paste', 'codex' as const, '', true],
    ['startup-paste multi-line', 'codex' as const, 'Reproduce on Windows first', true]
  ])(
    'keeps the seeded draft and chat-opening decision aligned for %s',
    async (_label, quickAgent, note, expectMirrored) => {
      await submitFolderWorkspaceCreate({
        projectGroup: makeProjectGroup(),
        name: '',
        lastAutoName: '',
        linkedWorkItem: linkedIssue,
        note,
        quickAgent,
        autoRenameBranchFromWork: false,
        agentCmdOverrides: {},
        createFolderWorkspace: vi.fn(async () => makeFolderWorkspace()),
        onOpenChange: vi.fn()
      })

      const startup = mocks.activateAndRevealFolderWorkspace.mock.calls[0]?.[1]?.startup
      const seeded = seededDraftFor('tab-1') != null
      const draftText = resolveStartupLaunchDraftText(startup)
      const opensInChat =
        decideInitialAgentTabViewMode({
          experimentalNativeChat: true,
          openAgentTabsInChatByDefault: true,
          agent: quickAgent,
          ...(draftText != null
            ? { promptDelivery: 'draft' as const, launchDraftText: draftText }
            : {})
        }) === 'chat'

      expect(`${startup?.command ?? ''}${startup?.draftPrompt ?? ''}`).toContain(ISSUE_URL)
      expect(seeded).toBe(expectMirrored)
      expect(opensInChat).toBe(expectMirrored)
    }
  )
})
