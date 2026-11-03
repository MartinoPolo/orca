import { describe, expect, it } from 'vitest'
import { WorkerStartParams } from '../../../../../../shared/rpc-contract/orchestration-worker-start-params'
import {
  downgradeWorkerStartModeForLaunchProfile,
  type WorkerStartModeReceipt
} from '../../orchestration-worker-start-mode'
import {
  resolveLocalWorkerLaunchProfile,
  resolveWorkerLaunchProfile,
  type WorkerCoordinatorAccount
} from './worker-launch-profile'

const workClaude = {
  id: 'claude-work',
  name: 'ccw',
  command: 'ccw',
  agentDirectory: 'C:\\Users\\me\\.claude-work'
}
const workPi = {
  id: 'pi-work',
  name: 'piw',
  command: 'piw',
  agentDirectory: 'C:\\Users\\me\\.pi\\agent-work'
}
const settings = {
  claudeLaunchProfiles: [workClaude],
  piLaunchProfiles: [workPi]
}

function coordinator(account: Partial<WorkerCoordinatorAccount>): WorkerCoordinatorAccount {
  return { agent: 'claude', agentEnv: {}, ...account }
}

describe('resolveWorkerLaunchProfile', () => {
  it('finds a requested profile by name, ignoring case, or by id', () => {
    for (const requested of ['CCW', 'claude-work']) {
      expect(
        resolveWorkerLaunchProfile({
          settings,
          agent: 'claude',
          requested,
          coordinator: null
        })
      ).toEqual(workClaude)
    }
  })

  it('names the configured profiles when a requested one is missing', () => {
    expect(() =>
      resolveWorkerLaunchProfile({
        settings,
        agent: 'claude',
        requested: 'piw',
        coordinator: null
      })
    ).toThrow(/No Claude launch profile is named piw \(configured: ccw\)/)
  })

  it('refuses a requested profile for an agent without profiles', () => {
    expect(() =>
      resolveWorkerLaunchProfile({
        settings,
        agent: 'codex',
        requested: 'ccw',
        coordinator: null
      })
    ).toThrow(/codex has no launch profiles/)
  })

  it("inherits the coordinator's account from its reported transcript", () => {
    expect(
      resolveWorkerLaunchProfile({
        settings,
        agent: 'claude',
        requested: undefined,
        coordinator: coordinator({
          transcriptPath: 'C:\\Users\\me\\.claude-work\\projects\\repo\\session.jsonl'
        })
      })
    ).toEqual(workClaude)
  })

  it("inherits the account root a coordinator's own profile launch recorded", () => {
    expect(
      resolveWorkerLaunchProfile({
        settings,
        agent: 'pi',
        requested: undefined,
        coordinator: coordinator({
          agent: 'pi',
          agentEnv: { PI_CODING_AGENT_DIR: 'C:/Users/me/.pi/agent-work/' }
        })
      })
    ).toEqual(workPi)
  })

  it('keeps the built-in account for a default-account coordinator, another agent, or default', () => {
    const workCoordinator = coordinator({
      transcriptPath: 'C:\\Users\\me\\.claude-work\\projects\\repo\\session.jsonl'
    })
    const cases = [
      {
        agent: 'claude' as const,
        requested: undefined,
        coordinator: coordinator({
          transcriptPath: 'C:\\Users\\me\\.claude\\projects\\repo\\session.jsonl',
          agentEnv: { CLAUDE_CONFIG_DIR: workClaude.agentDirectory }
        })
      },
      {
        agent: 'pi' as const,
        requested: undefined,
        coordinator: workCoordinator
      },
      {
        agent: 'claude' as const,
        requested: 'default',
        coordinator: workCoordinator
      },
      { agent: 'claude' as const, requested: undefined, coordinator: null }
    ]
    for (const testCase of cases) {
      expect(resolveWorkerLaunchProfile({ settings, ...testCase })).toBeUndefined()
    }
  })
})

describe('resolveLocalWorkerLaunchProfile', () => {
  function runtimeWith(options: { store: boolean; transcriptPath?: string }) {
    return {
      requireStore: () => {
        if (!options.store) {
          throw new Error('runtime_unavailable')
        }
        return { getSettings: () => settings }
      },
      getTerminalPaneKey: () => 'tab:pane',
      getTerminalLaunchEnvironmentForPaneKey: () => ({
        agent: 'claude' as const,
        agentEnv: {}
      }),
      getAgentStatusRowsForPane: () =>
        options.transcriptPath
          ? [
              {
                agentType: 'claude',
                providerSession: { transcriptPath: options.transcriptPath }
              }
            ]
          : []
    } as unknown as Parameters<typeof resolveLocalWorkerLaunchProfile>[0]
  }
  const workTranscript = 'C:\\Users\\me\\.claude-work\\projects\\repo\\session.jsonl'

  it("reads the coordinator pane's reported transcript to inherit its profile", () => {
    const runtime = runtimeWith({
      store: true,
      transcriptPath: workTranscript
    })
    expect(
      resolveLocalWorkerLaunchProfile(runtime, 'claude', {
        from: 'term_coordinator'
      })
    ).toEqual(workClaude)
  })

  it('keeps the account of a reused terminal and offers no profiles without a settings store', () => {
    const reused = {
      from: 'term_coordinator',
      terminal: 'term_worker',
      launchProfile: 'ccw'
    }
    expect(
      resolveLocalWorkerLaunchProfile(runtimeWith({ store: true }), 'claude', reused)
    ).toBeUndefined()
    const storeless = runtimeWith({
      store: false,
      transcriptPath: workTranscript
    })
    expect(
      resolveLocalWorkerLaunchProfile(storeless, 'claude', {
        from: 'term_coordinator'
      })
    ).toBeUndefined()
  })
})

describe('worker launch profile placement', () => {
  it('starts a chat-default worker in a terminal and says why', () => {
    const chatDefault: WorkerStartModeReceipt = {
      mode: 'structured',
      preferred: 'structured',
      reason: 'user_default',
      detail: 'Started a structured chat session worker.'
    }
    expect(downgradeWorkerStartModeForLaunchProfile(chatDefault)).toMatchObject({
      mode: 'terminal',
      reason: 'launch_profile'
    })
  })

  it('refuses a profile beside a reused terminal or a remote server', () => {
    const base = {
      spec: 'Do the task',
      from: 'term_coordinator',
      launchProfile: 'ccw'
    }
    expect(WorkerStartParams.safeParse({ ...base, agent: 'claude' }).success).toBe(true)
    expect(WorkerStartParams.safeParse({ ...base, terminal: 'term_worker' }).success).toBe(false)
    expect(WorkerStartParams.safeParse({ ...base, agent: 'claude', on: 'server' }).success).toBe(
      false
    )
  })
})
