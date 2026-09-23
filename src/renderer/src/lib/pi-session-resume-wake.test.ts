import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SleepingAgentSessionRecord } from '../../../shared/agent-session-resume'
import type { Repo } from '../../../shared/repo-types'
import type { TerminalTab } from '../../../shared/terminal-tab-types'
import type { Worktree } from '../../../shared/worktree/types'
import { useAppStore } from '@/store'
import { resumeSleepingAgentSessionsForWorktree } from './resume-sleeping-agent-session'

const initialAppStoreState = useAppStore.getState()
const PI_TRANSCRIPT_PATH = join(homedir(), '.pi', 'agent', 'sessions', 'pi-session-1.jsonl')

afterEach(() => {
  useAppStore.setState(initialAppStoreState, true)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Pi session wake', () => {
  it('wakes a manually slept Pi session with its transcript identity', () => {
    vi.stubGlobal('window', {
      api: {
        platform: {
          get: () => ({
            platform: process.platform,
            osRelease: '',
            arch: process.arch,
            shell: '',
            homeDirectory: homedir(),
            displayServer: null
          })
        }
      }
    })
    const providerSession = {
      key: 'session_id' as const,
      id: 'pi-session-1',
      transcriptPath: PI_TRANSCRIPT_PATH
    }
    const record: SleepingAgentSessionRecord = {
      paneKey: 'tab-1:leaf-1',
      tabId: 'tab-1',
      worktreeId: 'wt-1',
      agent: 'pi',
      providerSession,
      prompt: '',
      state: 'working',
      capturedAt: 1,
      updatedAt: 1,
      origin: 'worktree-sleep',
      connectionId: null
    }
    const tab: TerminalTab = {
      id: 'tab-1',
      ptyId: null,
      worktreeId: 'wt-1',
      title: 'shell',
      customTitle: null,
      color: null,
      sortOrder: 0,
      createdAt: 1
    }
    const repo: Repo = {
      id: 'repo-1',
      path: tmpdir(),
      displayName: 'Local repo',
      badgeColor: '#000',
      addedAt: 1,
      connectionId: null,
      executionHostId: 'local'
    }
    const worktree: Worktree = {
      id: 'wt-1',
      repoId: repo.id,
      path: tmpdir(),
      head: 'abc123',
      branch: 'main',
      isBare: false,
      isMainWorktree: true,
      displayName: 'main',
      comment: '',
      linkedIssue: null,
      linkedPR: null,
      linkedLinearIssue: null,
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: 0,
      lastActivityAt: 1
    }
    useAppStore.setState({
      repos: [repo],
      worktreesByRepo: { [repo.id]: [worktree] },
      tabsByWorktree: { 'wt-1': [tab] },
      sleepingAgentSessionsByPaneKey: { [record.paneKey]: record }
    })

    const launched = resumeSleepingAgentSessionsForWorktree('wt-1')

    expect(launched).toBe(1)
    const state = useAppStore.getState()
    const resumedTab = state.tabsByWorktree['wt-1']?.find((candidate) => candidate.id !== tab.id)
    expect(resumedTab?.launchAgent).toBe('pi')
    expect(state.pendingStartupByTabId[resumedTab!.id]?.resumeProviderSession).toEqual(
      providerSession
    )
    expect(state.sleepingAgentSessionsByPaneKey[record.paneKey]).toBeUndefined()
  })
})
