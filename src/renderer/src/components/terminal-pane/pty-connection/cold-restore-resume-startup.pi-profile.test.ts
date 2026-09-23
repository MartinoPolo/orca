import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SleepingAgentSessionRecord } from '../../../../../shared/agent-session-resume'

const toastError = vi.fn()
let storeState: Record<string, unknown> & {
  settings: {
    agentCmdOverrides: Record<string, string>
    agentDefaultArgs: Record<string, string>
    agentDefaultEnv: Record<string, Record<string, string>>
    terminalWindowsShell: string
    piLaunchProfiles: {
      id: string
      name: string
      command: string
      agentDirectory: string
    }[]
  }
}

vi.mock('@/store', () => ({ useAppStore: { getState: () => storeState } }))
vi.mock('sonner', () => ({ toast: { error: toastError } }))

const transcriptPath = 'C:/Users/ada/.pi-work/agent/sessions/session.jsonl'

function sleepingRecord(launchConfig: SleepingAgentSessionRecord['launchConfig']) {
  return {
    paneKey: 'tab-1:leaf-1',
    worktreeId: 'wt-1',
    agent: 'pi',
    providerSession: { key: 'session_id', id: 'session-1', transcriptPath },
    prompt: 'continue',
    state: 'working',
    capturedAt: 1,
    updatedAt: 1,
    launchConfig
  } satisfies SleepingAgentSessionRecord
}

async function buildColdStartup(
  record: SleepingAgentSessionRecord,
  target: 'local' | 'ssh' | 'wsl' | 'paired' | 'unknown' = 'local'
) {
  const { bindBuildColdRestoreAgentResumeStartup } = await import('./cold-restore-resume-startup')
  const session = {
    pendingStartupCommand: null,
    cacheKey: record.paneKey,
    getSleepingRecordForPane: () => ({ record, key: record.paneKey }),
    executionHostId:
      target === 'unknown'
        ? undefined
        : target === 'paired'
          ? 'runtime:env-1'
          : target === 'ssh'
            ? 'ssh:ssh-1'
            : 'local',
    projectRuntime:
      target === 'wsl'
        ? { status: 'resolved', runtime: { kind: 'wsl', distro: 'Ubuntu' } }
        : undefined,
    connectionId: target === 'ssh' ? 'ssh-1' : undefined,
    worktree: {
      id: 'wt-1',
      path: target === 'ssh' || target === 'paired' ? '/repo' : 'C:/repo'
    },
    shellOverride: 'git-bash',
    buildColdRestoreAgentResumeStartup: () => null
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The binding reads only the session fields supplied by this focused unit fixture.
  bindBuildColdRestoreAgentResumeStartup(session as never)
  return session.buildColdRestoreAgentResumeStartup()
}

describe('cold restore Pi profile provenance', () => {
  beforeEach(() => {
    toastError.mockReset()
    storeState = {
      settings: {
        agentCmdOverrides: {},
        agentDefaultArgs: { pi: '' },
        agentDefaultEnv: { pi: {} },
        terminalWindowsShell: 'git-bash',
        piLaunchProfiles: []
      },
      agentStatusByPaneKey: {},
      getAgentLaunchConfigForStatusEntry: () => undefined,
      repos: [{ id: 'repo-1', connectionId: null }],
      worktreesByRepo: { 'repo-1': [{ id: 'wt-1', repoId: 'repo-1', path: 'C:/repo' }] },
      projects: [{ id: 'repo-1', localWindowsRuntimePreference: { kind: 'windows-host' } }],
      folderWorkspaces: [],
      projectGroups: [],
      activeRepoId: 'repo-1',
      activeWorktreeId: 'wt-1'
    }
  })

  it('uses an unstamped captured work command and root after the profile is deleted', async () => {
    const startup = await buildColdStartup(
      sleepingRecord({
        agentCommand: 'C:/old/piw',
        agentArgs: '--model test',
        agentEnv: {
          PI_CODING_AGENT_DIR: 'C:/Users/ada/.pi-work/agent',
          ORCA_PI_SOURCE_AGENT_DIR: 'C:/Users/ada/.pi-work/agent'
        }
      })
    )

    expect(startup).toMatchObject({
      command: expect.stringContaining('C:/old/piw'),
      env: {
        PI_CODING_AGENT_DIR: 'C:/Users/ada/.pi-work/agent',
        ORCA_PI_SOURCE_AGENT_DIR: 'C:/Users/ada/.pi-work/agent',
        ORCA_AGENT_LAUNCH_TOKEN: expect.any(String)
      }
    })
  })

  it('repins stale personal command and environment from work transcript provenance', async () => {
    storeState.settings.piLaunchProfiles = [
      {
        id: 'work',
        name: 'Work',
        command: 'C:/tools/piw',
        agentDirectory: 'C:/Users/ada/.pi-work/agent'
      }
    ]

    const startup = await buildColdStartup({
      ...sleepingRecord({
        agentCommand: 'C:/tools/pip',
        agentArgs: '',
        agentEnv: {
          PI_CODING_AGENT_DIR: 'C:/Users/ada/.pi-personal/agent',
          ORCA_PI_SOURCE_AGENT_DIR: 'C:/Users/ada/.pi-personal/agent'
        }
      }),
      connectionId: null
    })

    expect(startup).toMatchObject({
      command: expect.stringContaining('C:/tools/piw'),
      env: {
        PI_CODING_AGENT_DIR: 'C:/Users/ada/.pi-work/agent',
        ORCA_PI_SOURCE_AGENT_DIR: 'C:/Users/ada/.pi-work/agent',
        ORCA_AGENT_LAUNCH_TOKEN: expect.any(String)
      }
    })
  })

  it('does not inject a local profile into an unstamped cold restore', async () => {
    storeState.settings.piLaunchProfiles = [
      {
        id: 'work',
        name: 'Work',
        command: 'C:/tools/piw',
        agentDirectory: 'C:/Users/ada/.pi-work/agent'
      }
    ]

    const startup = await buildColdStartup(
      sleepingRecord({
        agentCommand: 'remote-pi',
        agentArgs: '--remote',
        agentEnv: { REMOTE_ACCOUNT: 'true' }
      })
    )

    expect(startup).toBeNull()
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('origin host'))
  })

  it.each(['ssh', 'wsl', 'paired'] as const)(
    'leaves a %s Pi snapshot unchanged when its transcript text collides with a local profile',
    async (target) => {
      storeState.settings.piLaunchProfiles = [
        {
          id: 'work',
          name: 'Work',
          command: 'C:/tools/local-piw',
          agentDirectory: 'C:/Users/ada/.pi-work/agent'
        }
      ]
      if (target === 'ssh') {
        storeState.repos = [{ id: 'repo-1', connectionId: 'ssh-1' }]
      } else if (target === 'wsl') {
        storeState.projects = [
          { id: 'repo-1', localWindowsRuntimePreference: { kind: 'wsl', distro: 'Ubuntu' } }
        ]
      } else {
        storeState.repos = [{ id: 'repo-1', connectionId: null, executionHostId: 'runtime:env-1' }]
      }
      const startup = await buildColdStartup(
        {
          ...sleepingRecord({
            agentCommand: 'remote-pi',
            agentArgs: '--remote',
            agentEnv: { REMOTE_ACCOUNT: 'true' }
          }),
          connectionId: target === 'ssh' ? 'ssh-1' : null
        },
        target
      )

      expect(startup).toMatchObject({
        command: expect.stringContaining('remote-pi'),
        env: {
          REMOTE_ACCOUNT: 'true',
          ORCA_AGENT_LAUNCH_TOKEN: expect.any(String)
        }
      })
    }
  )

  it('defers Pi resume when the pane host and workspace owner are both unknown', async () => {
    storeState.repos = []
    storeState.settings.piLaunchProfiles = [
      {
        id: 'work',
        name: 'Work',
        command: 'C:/tools/piw',
        agentDirectory: 'C:/Users/ada/.pi-work/agent'
      }
    ]

    const startup = await buildColdStartup(
      sleepingRecord({
        agentCommand: 'C:/tools/pip',
        agentArgs: '',
        agentEnv: {
          PI_CODING_AGENT_DIR: 'C:/Users/ada/.pi-personal/agent',
          ORCA_PI_SOURCE_AGENT_DIR: 'C:/Users/ada/.pi-personal/agent'
        }
      }),
      'unknown'
    )

    expect(startup).toBeNull()
    expect(toastError).toHaveBeenCalledWith(
      'Cannot resume Pi until its workspace owner is available.'
    )
  })
})
