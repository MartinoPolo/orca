import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveAiVaultAccountLaunchInputs } from './ai-vault-account-launch-inputs'

type TestState = Parameters<typeof resolveAiVaultAccountLaunchInputs>[0]['state']

const claudeWork = {
  id: 'claude-work',
  name: 'ccw',
  command: 'ccw',
  agentDirectory: 'C:/Users/ada/.claude-work',
  remoteAgentDirectory: '~/.claude-work'
}

let state: Record<string, unknown>

function resolve(args: Partial<Parameters<typeof resolveAiVaultAccountLaunchInputs>[0]>) {
  return resolveAiVaultAccountLaunchInputs({
    agent: 'claude',
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The fixture supplies every field the owner and host-scope lookups read.
    state: state as unknown as TestState,
    agentArgs: '',
    agentEnv: {},
    commandOverride: 'claude',
    ...args
  })
}

describe('AI Vault account launch inputs', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      api: { platform: { get: () => ({ homeDirectory: 'C:/Users/ada' }) } }
    })
    state = {
      activeRepoId: 'repo-1',
      activeWorktreeId: 'wt-1',
      folderWorkspaces: [],
      projectGroups: [],
      projects: [{ id: 'repo-1', localWindowsRuntimePreference: { kind: 'windows-host' } }],
      repos: [{ id: 'repo-1', connectionId: null }],
      settings: { piLaunchProfiles: [], claudeLaunchProfiles: [claudeWork] },
      worktreesByRepo: { 'repo-1': [{ id: 'wt-1', repoId: 'repo-1', path: 'C:/repo' }] },
      sshConnectionStates: new Map()
    }
  })

  it('blocks explicitly local Pi history while the active target owner is unresolved', () => {
    state.repos = []
    state.worktreesByRepo = {}
    expect(() =>
      resolve({
        agent: 'pi',
        transcriptPath: 'C:/Users/alice/.pi/agent/sessions/session-one.jsonl',
        sessionExecutionHostId: 'local',
        commandOverride: undefined
      })
    ).toThrow('target workspace owner is known')
  })

  it('pins local Claude history to the profile that owns its transcript', () => {
    expect(
      resolve({
        transcriptPath: 'C:/Users/ada/.claude-work/projects/C--repo/session.jsonl',
        sessionExecutionHostId: 'local'
      })
    ).toMatchObject({
      commandOverride: 'ccw',
      accountEnvironment: { CLAUDE_CONFIG_DIR: 'C:/Users/ada/.claude-work' }
    })
  })

  it('pins SSH Claude history to the remote root of its profile on the recording host', () => {
    state.repos = [{ id: 'repo-1', connectionId: 'ssh-1', executionHostId: 'ssh:ssh-1' }]
    state.sshConnectionStates = new Map([['ssh-1', { remoteHomeDirectory: '/home/agent' }]])

    expect(
      resolve({
        transcriptPath: '/home/agent/.claude-work/projects/-home-agent-repo/session.jsonl',
        sessionExecutionHostId: 'ssh:ssh-1'
      })
    ).toMatchObject({
      commandOverride: 'ccw',
      accountEnvironment: { CLAUDE_CONFIG_DIR: '/home/agent/.claude-work' }
    })
  })

  it('keeps the recorded launch for history from a different host than the target', () => {
    expect(
      resolve({
        transcriptPath: '/home/agent/.claude-work/projects/-home-agent-repo/session.jsonl',
        sessionExecutionHostId: 'ssh:ssh-1'
      })
    ).toMatchObject({ commandOverride: 'claude', launchConfig: null, accountEnvironment: null })
  })
})
