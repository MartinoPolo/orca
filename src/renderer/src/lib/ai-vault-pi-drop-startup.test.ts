import { describe, expect, it } from 'vitest'
import { getDefaultSettings } from '../../../shared/constants'
import type { AiVaultSessionDragPayload } from './ai-vault-session-drag'
import { resolveAiVaultPiDropStartup } from './ai-vault-pi-drop-startup'

function localState(profiles: unknown = []) {
  return {
    settings: { ...getDefaultSettings('/Users/ada'), piLaunchProfiles: profiles },
    repos: [{ id: 'repo-1', connectionId: null, path: '/repo' }],
    projects: [{ id: 'repo-1' }],
    worktreesByRepo: {
      'repo-1': [{ id: 'wt-1', repoId: 'repo-1', path: '/repo/worktree' }]
    },
    folderWorkspaces: [],
    projectGroups: [],
    activeRepoId: 'repo-1',
    activeWorktreeId: 'wt-1'
  }
}

function resolveDrop(
  state: unknown,
  payload: AiVaultSessionDragPayload,
  options: { platform?: NodeJS.Platform; defaultAgentDirectory?: string } = {}
) {
  return resolveAiVaultPiDropStartup({
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Focused fixtures supply every state slice read by the target and shell resolvers.
    state: state as never,
    payload,
    worktreeId: 'wt-1',
    platform: options.platform ?? 'linux',
    defaultAgentDirectory: options.defaultAgentDirectory ?? '/Users/ada/.pi/agent'
  })
}

function piPayload(overrides: Partial<AiVaultSessionDragPayload> = {}): AiVaultSessionDragPayload {
  return {
    agent: 'pi',
    sessionId: 'session-1',
    title: 'Pi session',
    command: 'stale-pi --unsafe',
    sessionFilePath: '/accounts/work/sessions/session-1.jsonl',
    sessionExecutionHostId: 'local',
    ...overrides
  }
}

describe('Pi AI Vault drop startup safety', () => {
  it('rebuilds an explicitly local legacy work drop with the owning profile command and account environment', () => {
    const result = resolveDrop(
      localState([
        {
          id: 'work',
          name: 'Work',
          command: '/tools/pi-work',
          agentDirectory: '/accounts/work'
        }
      ]),
      piPayload({ env: { PI_CODING_AGENT_DIR: '/accounts/personal' } })
    )

    expect(result).toMatchObject({
      ok: true,
      startup: {
        env: {
          PI_CODING_AGENT_DIR: '/accounts/work',
          ORCA_PI_SOURCE_AGENT_DIR: '/accounts/work'
        },
        launchConfig: {
          agentCommand: '/tools/pi-work',
          agentEnv: {
            PI_CODING_AGENT_DIR: '/accounts/work',
            ORCA_PI_SOURCE_AGENT_DIR: '/accounts/work'
          }
        }
      }
    })
    expect(result.ok && result.startup.command).toContain('/tools/pi-work')
    expect(result.ok && result.startup.command).toContain('/accounts/work/sessions/session-1.jsonl')
    expect(result.ok && result.startup.command).not.toContain('stale-pi')
  })

  it('keeps the conventional default only when the trusted local home owns the transcript', () => {
    const payload = piPayload({
      sessionFilePath: '/Users/ada/.pi/agent/sessions/session-1.jsonl'
    })
    const trustedResult = resolveDrop(localState(), payload)

    expect(trustedResult).toMatchObject({ ok: true })
    expect(trustedResult.ok && trustedResult.startup.command).toContain(
      '/Users/ada/.pi/agent/sessions/session-1.jsonl'
    )
    expect(trustedResult.ok && trustedResult.startup.command).not.toContain('stale-pi')
    expect(
      resolveDrop(localState(), payload, {
        defaultAgentDirectory: '/Users/someone-else/.pi/agent'
      })
    ).toMatchObject({ ok: false })
  })

  it('keeps a complete captured snapshot after its profile is deleted', () => {
    const launchConfig = {
      agentCommand: '/deleted-profile/pi-work --model work-model',
      agentArgs: '--model work-model',
      agentEnv: {
        PI_CODING_AGENT_DIR: '/accounts/work',
        ORCA_PI_SOURCE_AGENT_DIR: '/accounts/work'
      }
    }
    const result = resolveDrop(localState(), piPayload({ launchConfig }))

    expect(result).toMatchObject({
      ok: true,
      startup: { env: launchConfig.agentEnv, launchConfig }
    })
    expect(result.ok && result.startup.command).toContain(
      '/deleted-profile/pi-work --model work-model'
    )
  })

  it.each([
    ['unstamped source', piPayload({ sessionExecutionHostId: undefined })],
    ['mismatched source', piPayload({ sessionExecutionHostId: 'runtime:other' })],
    ['missing transcript', piPayload({ sessionFilePath: undefined })]
  ])('blocks an unsafe local-native drop with %s', (_label, payload) => {
    expect(resolveDrop(localState(), payload)).toMatchObject({ ok: false })
  })

  it('blocks a Pi drop when the target owner is unresolved', () => {
    const state = localState()
    state.repos = []

    expect(resolveDrop(state, piPayload())).toMatchObject({ ok: false })
  })

  it('preserves a local WSL snapshot without applying local native profiles', () => {
    const payload = piPayload({
      command: 'pi --session /home/ada/.pi/agent/sessions/session-1.jsonl',
      sessionFilePath:
        '\\\\wsl.localhost\\Ubuntu\\home\\ada\\.pi\\agent\\sessions\\session-1.jsonl',
      env: { PI_CODING_AGENT_DIR: '/home/ada/.pi/agent' },
      launchConfig: {
        agentCommand: 'pi',
        agentArgs: '',
        agentEnv: { PI_CODING_AGENT_DIR: '/home/ada/.pi/agent' }
      }
    })
    const state = {
      ...localState([
        {
          id: 'local-native',
          name: 'Local native',
          command: 'pi-native',
          agentDirectory: '/home/ada/.pi/agent'
        }
      ]),
      projects: [
        {
          id: 'repo-1',
          localWindowsRuntimePreference: { kind: 'wsl' as const, distro: 'Ubuntu' }
        }
      ]
    }

    expect(resolveDrop(state, payload, { platform: 'win32' })).toEqual({
      ok: true,
      startup: {
        command: payload.command,
        env: payload.env,
        launchConfig: payload.launchConfig
      }
    })
  })

  it('preserves a remote snapshot without applying local Pi profiles', () => {
    const launchConfig = {
      agentCommand: '/remote/pi-account',
      agentArgs: '--remote-arg',
      agentEnv: { PI_CODING_AGENT_DIR: '/remote/account' }
    }
    const payload = piPayload({
      command: '/remote/pi-account --remote-arg --session /remote/account/sessions/session-1.jsonl',
      sessionFilePath: '/remote/account/sessions/session-1.jsonl',
      sessionExecutionHostId: 'runtime:server',
      env: launchConfig.agentEnv,
      envToDelete: ['LOCAL_ONLY'],
      launchConfig
    })
    const state = {
      ...localState([
        {
          id: 'local-work',
          name: 'Local Work',
          command: '/local/pi-work',
          agentDirectory: '/remote/account'
        }
      ]),
      repos: [{ id: 'repo-1', executionHostId: 'runtime:server', path: '/repo' }],
      worktreesByRepo: {
        'repo-1': [
          {
            id: 'wt-1',
            repoId: 'repo-1',
            path: '/repo/worktree',
            hostId: 'runtime:server'
          }
        ]
      }
    }

    expect(resolveDrop(state, payload)).toEqual({
      ok: true,
      startup: {
        command: payload.command,
        env: payload.env,
        envToDelete: payload.envToDelete,
        launchConfig
      }
    })
    expect(resolveDrop(state, { ...payload, sessionExecutionHostId: undefined })).toMatchObject({
      ok: false
    })
  })
})
