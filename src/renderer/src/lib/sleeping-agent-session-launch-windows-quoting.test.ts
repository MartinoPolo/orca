// Windows shell-quoting coverage for the sleeping-agent resume launch (#12320):
// the queued resume line is typed into the new tab's shell, so cmd.exe tabs must
// not receive PowerShell single quotes.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SleepingAgentSessionRecord } from '../../../shared/agent-session-resume'

const mockCreateTab = vi.fn()
const mockToastError = vi.fn()

type TestSettings = {
  agentCmdOverrides: Record<string, string>
  agentDefaultArgs: Record<string, string>
  agentDefaultEnv: Record<string, Record<string, string>>
  activeRuntimeEnvironmentId: string | null
  terminalWindowsShell?: string
  piLaunchProfiles?: {
    id: string
    name: string
    command: string
    agentDirectory: string
  }[]
}

const initialSettings: TestSettings = {
  agentCmdOverrides: {},
  agentDefaultArgs: {},
  agentDefaultEnv: {},
  activeRuntimeEnvironmentId: null
}

type TestRepo = {
  id: string
  connectionId: string | null
  executionHostId?: string
  path: string
}

type TestProject = {
  id: string
  localWindowsRuntimePreference: { kind: 'windows-host' } | { kind: 'wsl'; distro: string }
}

const initialRepos: TestRepo[] = [
  {
    id: 'repo-1',
    connectionId: null,
    path: 'C:\\Users\\neil\\repo'
  }
]
const initialProjects: TestProject[] = [
  {
    id: 'repo-1',
    localWindowsRuntimePreference: { kind: 'windows-host' }
  }
]

const store = {
  settings: initialSettings,
  repos: initialRepos,
  projects: initialProjects,
  folderWorkspaces: [],
  projectGroups: [],
  activeRepoId: 'repo-1',
  activeWorktreeId: 'wt-1',
  worktreesByRepo: {
    'repo-1': [
      {
        id: 'wt-1',
        repoId: 'repo-1',
        path: 'C:\\Users\\neil\\repo\\feature',
        displayName: 'feature'
      }
    ]
  } as Record<string, { id: string; repoId: string; path: string; displayName: string }[]>,
  getKnownWorktreeById: (id: string) =>
    Object.values(store.worktreesByRepo)
      .flat()
      .find((worktree) => worktree.id === id),
  tabsByWorktree: { 'wt-1': [{ id: 'tab-1' }] },
  openFiles: [] as { id: string; worktreeId: string }[],
  browserTabsByWorktree: {} as Record<string, { id: string }[]>,
  tabBarOrderByWorktree: {} as Record<string, string[]>,
  createTab: mockCreateTab,
  claimAutomaticAgentResume: vi.fn(),
  clearSleepingAgentSession: vi.fn(),
  setActiveTabType: vi.fn(),
  setTabBarOrder: vi.fn()
}

vi.mock('@/store', () => ({ useAppStore: { getState: () => store } }))
vi.mock('@/lib/new-workspace', () => ({ CLIENT_PLATFORM: 'win32' }))
vi.mock('@/lib/renderer-app-platform', () => ({ getRendererAppPlatform: () => 'win32' }))
vi.mock('sonner', () => ({ toast: { message: vi.fn(), error: mockToastError } }))
vi.mock('@/lib/telemetry', () => ({
  track: vi.fn(),
  tuiAgentToAgentKind: (agent: string) => agent
}))
vi.mock('@/components/tab-bar/reconcile-order', () => ({
  reconcileTabOrder: vi.fn((_stored, termIds: string[]) => [...termIds])
}))

const SESSION_ID = '0199f7a1-0000-7000-8000-000000000001'

const record: SleepingAgentSessionRecord = {
  paneKey: 'tab-1::leaf-1',
  tabId: 'tab-1',
  worktreeId: 'wt-1',
  agent: 'codex',
  providerSession: { key: 'session_id', id: SESSION_ID },
  prompt: 'finish the task',
  state: 'done',
  origin: 'worktree-sleep',
  capturedAt: 1,
  updatedAt: 1
}

async function launchSession(sessionRecord = record): Promise<boolean> {
  const { launchSleepingAgentSession } = await import('./sleeping-agent-session-launch')
  return launchSleepingAgentSession(sessionRecord)
}

async function launch(sessionRecord = record): Promise<string | undefined> {
  await launchSession(sessionRecord)
  const options = mockCreateTab.mock.calls.at(-1)?.[3] as
    | { pendingStartup?: { command: string } }
    | undefined
  return options?.pendingStartup?.command
}

describe('launchSleepingAgentSession Windows shell quoting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    store.settings = {
      agentCmdOverrides: {},
      agentDefaultArgs: {},
      agentDefaultEnv: {},
      activeRuntimeEnvironmentId: null
    }
    store.repos = [
      {
        id: 'repo-1',
        connectionId: null,
        executionHostId: undefined,
        path: 'C:\\Users\\neil\\repo'
      }
    ]
    store.projects = [{ id: 'repo-1', localWindowsRuntimePreference: { kind: 'windows-host' } }]
    store.worktreesByRepo = {
      'repo-1': [
        {
          id: 'wt-1',
          repoId: 'repo-1',
          path: 'C:\\Users\\neil\\repo\\feature',
          displayName: 'feature'
        }
      ]
    }
    mockCreateTab.mockReturnValue({ id: 'tab-1' })
  })

  it('quotes the resume argv for a cmd.exe tab', async () => {
    store.settings.terminalWindowsShell = 'cmd.exe'

    await expect(launch()).resolves.toBe(
      `codex "--dangerously-bypass-approvals-and-sandbox" "resume" "${SESSION_ID}"`
    )
  })

  it('keeps PowerShell quoting for a powershell tab', async () => {
    store.settings.terminalWindowsShell = 'powershell.exe'

    await expect(launch()).resolves.toBe(
      `codex '--dangerously-bypass-approvals-and-sandbox' 'resume' '${SESSION_ID}'`
    )
  })

  it('quotes the resume argv for a Git Bash tab', async () => {
    store.settings.terminalWindowsShell = 'git-bash'

    await expect(launch()).resolves.toBe(
      `codex '--dangerously-bypass-approvals-and-sandbox' 'resume' '${SESSION_ID}'`
    )
  })

  it('ignores the local Windows shell setting for an SSH workspace', async () => {
    store.settings.terminalWindowsShell = 'cmd.exe'
    store.repos = [
      { id: 'repo-1', connectionId: 'ssh-1', executionHostId: undefined, path: '/home/neil/repo' }
    ]
    store.worktreesByRepo = {
      'repo-1': [
        {
          id: 'wt-1',
          repoId: 'repo-1',
          path: '/home/neil/repo/feature',
          displayName: 'feature'
        }
      ]
    }

    await expect(launch()).resolves.toBe(
      `codex '--dangerously-bypass-approvals-and-sandbox' 'resume' '${SESSION_ID}'`
    )
  })
  it.each([
    ['cmd.exe', 'omp "--resume" "C:\\custom sessions\\session.jsonl"'],
    ['powershell.exe', "omp '--resume' 'C:\\custom sessions\\session.jsonl'"]
  ])('keeps a hook-only OMP locator when waking into %s', async (shell, expected) => {
    store.settings.terminalWindowsShell = shell
    const omp: SleepingAgentSessionRecord = {
      ...record,
      agent: 'omp',
      providerSession: {
        key: 'session_id',
        id: SESSION_ID,
        transcriptPath: 'C:\\custom sessions\\session.jsonl'
      }
    }
    await expect(launch(omp)).resolves.toBe(expected)
  })
  it('retains an unstamped captured Pi work account after its profile is deleted', async () => {
    store.settings.terminalWindowsShell = 'powershell.exe'
    const pi: SleepingAgentSessionRecord = {
      ...record,
      agent: 'pi',
      providerSession: {
        key: 'session_id',
        id: SESSION_ID,
        transcriptPath: 'C:/Users/neil/.pi-work/agent/sessions/session.jsonl'
      },
      launchConfig: {
        agentCommand: 'C:/old/piw',
        agentArgs: '--model test',
        agentEnv: {
          PI_CODING_AGENT_DIR: 'C:/Users/neil/.pi-work/agent',
          ORCA_PI_SOURCE_AGENT_DIR: 'C:/Users/neil/.pi-work/agent'
        }
      }
    }

    await expect(launch(pi)).resolves.toContain('C:/old/piw')
    expect(mockCreateTab.mock.calls.at(-1)?.[3]).toMatchObject({
      pendingStartup: {
        env: {
          PI_CODING_AGENT_DIR: 'C:/Users/neil/.pi-work/agent',
          ORCA_PI_SOURCE_AGENT_DIR: 'C:/Users/neil/.pi-work/agent'
        },
        launchConfig: {
          agentCommand: expect.stringContaining('C:/old/piw'),
          agentArgs: '--model test'
        }
      }
    })
  })

  it('repins a Pi work session whose captured command and environment are stale personal values', async () => {
    store.settings.terminalWindowsShell = 'powershell.exe'
    store.settings.piLaunchProfiles = [
      {
        id: 'work',
        name: 'Work',
        command: 'C:/tools/piw',
        agentDirectory: 'C:/Users/neil/.pi-work/agent'
      }
    ]
    const pi: SleepingAgentSessionRecord = {
      ...record,
      connectionId: null,
      agent: 'pi',
      providerSession: {
        key: 'session_id',
        id: SESSION_ID,
        transcriptPath: 'C:/Users/neil/.pi-work/agent/sessions/session.jsonl'
      },
      launchConfig: {
        agentCommand: 'C:/tools/pip',
        agentArgs: '',
        agentEnv: {
          PI_CODING_AGENT_DIR: 'C:/Users/neil/.pi-personal/agent',
          ORCA_PI_SOURCE_AGENT_DIR: 'C:/Users/neil/.pi-personal/agent'
        }
      }
    }

    await expect(launch(pi)).resolves.toContain('C:/tools/piw')
    expect(mockCreateTab.mock.calls.at(-1)?.[3]).toMatchObject({
      pendingStartup: {
        env: {
          PI_CODING_AGENT_DIR: 'C:/Users/neil/.pi-work/agent',
          ORCA_PI_SOURCE_AGENT_DIR: 'C:/Users/neil/.pi-work/agent'
        }
      }
    })
  })

  it('does not inject a local profile into an unstamped Pi record', async () => {
    store.settings.piLaunchProfiles = [
      {
        id: 'work',
        name: 'Work',
        command: 'C:/tools/piw',
        agentDirectory: 'C:/Users/neil/.pi-work/agent'
      }
    ]
    const pi: SleepingAgentSessionRecord = {
      ...record,
      agent: 'pi',
      providerSession: {
        key: 'session_id',
        id: SESSION_ID,
        transcriptPath: 'C:/Users/neil/.pi-work/agent/sessions/session.jsonl'
      },
      launchConfig: {
        agentCommand: 'remote-pi',
        agentArgs: '--remote',
        agentEnv: { REMOTE_ACCOUNT: 'true' }
      }
    }

    await expect(launchSession(pi)).resolves.toBe(false)
    expect(mockCreateTab).not.toHaveBeenCalled()
    expect(store.clearSleepingAgentSession).not.toHaveBeenCalled()
    expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('origin host'))
  })

  it.each([
    ['SSH', 'ssh' as const],
    ['WSL', 'wsl' as const],
    ['paired', 'paired' as const]
  ])(
    'leaves a %s Pi snapshot unchanged when its transcript text collides with a local profile',
    async (_label, target) => {
      store.settings.piLaunchProfiles = [
        {
          id: 'work',
          name: 'Work',
          command: 'C:/tools/local-piw',
          agentDirectory: 'C:/Users/neil/.pi-work/agent'
        }
      ]
      if (target === 'ssh') {
        store.repos = [
          { id: 'repo-1', connectionId: 'ssh-1', executionHostId: undefined, path: '/repo' }
        ]
      } else if (target === 'wsl') {
        store.projects = [
          {
            id: 'repo-1',
            localWindowsRuntimePreference: { kind: 'wsl', distro: 'Ubuntu' }
          }
        ]
      } else {
        store.repos = [
          {
            id: 'repo-1',
            connectionId: null,
            executionHostId: 'runtime:env-1',
            path: '/repo'
          }
        ]
      }
      const pi: SleepingAgentSessionRecord = {
        ...record,
        connectionId: target === 'ssh' ? 'ssh-1' : null,
        agent: 'pi',
        providerSession: {
          key: 'session_id',
          id: SESSION_ID,
          transcriptPath: 'C:/Users/neil/.pi-work/agent/sessions/session.jsonl'
        },
        launchConfig: {
          agentCommand: 'remote-pi',
          agentArgs: '--remote',
          agentEnv: { REMOTE_ACCOUNT: 'true' }
        }
      }

      await expect(launch(pi)).resolves.toContain('remote-pi')
      expect(mockCreateTab.mock.calls.at(-1)?.[3]).toMatchObject({
        pendingStartup: {
          env: { REMOTE_ACCOUNT: 'true' },
          launchConfig: { agentArgs: '--remote' }
        }
      })
    }
  )

  it('keeps an unknown-owner Pi record untouched until the workspace catalog is available', async () => {
    store.repos = []
    store.settings.piLaunchProfiles = [
      {
        id: 'work',
        name: 'Work',
        command: 'C:/tools/piw',
        agentDirectory: 'C:/Users/neil/.pi-work/agent'
      }
    ]
    const pi: SleepingAgentSessionRecord = {
      ...record,
      connectionId: null,
      agent: 'pi',
      providerSession: {
        key: 'session_id',
        id: SESSION_ID,
        transcriptPath: 'C:/Users/neil/.pi-work/agent/sessions/session.jsonl'
      },
      launchConfig: {
        agentCommand: 'C:/tools/pip',
        agentArgs: '',
        agentEnv: {
          PI_CODING_AGENT_DIR: 'C:/Users/neil/.pi-personal/agent',
          ORCA_PI_SOURCE_AGENT_DIR: 'C:/Users/neil/.pi-personal/agent'
        }
      }
    }

    await expect(launchSession(pi)).resolves.toBe(false)
    expect(mockCreateTab).not.toHaveBeenCalled()
    expect(store.clearSleepingAgentSession).not.toHaveBeenCalled()
    expect(mockToastError).toHaveBeenCalledWith(
      'Cannot resume Pi until its workspace owner is available.'
    )
  })

  it('keeps the remote OMP path instead of using the local Windows shell or UUID', async () => {
    store.settings.terminalWindowsShell = 'cmd.exe'
    store.repos = [
      { id: 'repo-1', connectionId: 'ssh-1', executionHostId: undefined, path: '/repo' }
    ]
    const omp: SleepingAgentSessionRecord = {
      ...record,
      agent: 'omp',
      providerSession: {
        key: 'session_id',
        id: SESSION_ID,
        transcriptPath: '/remote/custom sessions/session.jsonl'
      }
    }
    await expect(launch(omp)).resolves.toBe(
      "omp '--resume' '/remote/custom sessions/session.jsonl'"
    )
  })
})
