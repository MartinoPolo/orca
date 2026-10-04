import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentLaunchProfile } from '../../../shared/agent-launch-profiles'
import { resolveAgentAccountResumeLaunchConfig } from './agent-account-resume'

type TestState = Parameters<typeof resolveAgentAccountResumeLaunchConfig>[0]['state']

const piWork: AgentLaunchProfile = {
  id: 'pi-work',
  name: 'piw',
  command: 'piw',
  agentDirectory: 'C:/Users/ada/.pi/agent-work',
  remoteAgentDirectory: '~/.pi/agent-work'
}
const claudePersonal: AgentLaunchProfile = {
  id: 'claude-personal',
  name: 'cc',
  command: 'cc',
  agentDirectory: 'C:/Users/ada/.claude',
  remoteAgentDirectory: '~/.claude'
}
const claudeWork: AgentLaunchProfile = {
  id: 'claude-work',
  name: 'ccw',
  command: 'ccw',
  agentDirectory: 'C:/Users/ada/.claude-work',
  remoteAgentDirectory: '~/.claude-work'
}

let state: Record<string, unknown> & {
  settings: { piLaunchProfiles: AgentLaunchProfile[]; claudeLaunchProfiles: AgentLaunchProfile[] }
  sshConnectionStates: Map<string, { remoteHomeDirectory?: string }>
}

function useSshWorkspace(remoteHomeDirectory: string | undefined): void {
  state.repos = [{ id: 'repo-1', connectionId: 'ssh-1', executionHostId: 'ssh:ssh-1' }]
  state.worktreesByRepo = { 'repo-1': [{ id: 'wt-1', repoId: 'repo-1', path: '/home/agent/repo' }] }
  state.sshConnectionStates = new Map([['ssh-1', { remoteHomeDirectory }]])
}

function resolve(args: {
  agent: 'pi' | 'claude' | 'codex'
  transcriptPath?: string
  originConnectionId: string | null | undefined
  capturedLaunchConfig?: {
    agentCommand?: string
    agentArgs: string
    agentEnv: Record<string, string>
  }
  executionHostId?: 'local' | 'ssh:ssh-1'
}) {
  return resolveAgentAccountResumeLaunchConfig({
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The fixture supplies every field the owner and host-scope lookups read.
    state: state as unknown as TestState,
    agent: args.agent,
    worktreeId: 'wt-1',
    hostOptions: { executionHostId: args.executionHostId ?? 'local', platform: 'win32' },
    transcriptPath: args.transcriptPath,
    capturedLaunchConfig: args.capturedLaunchConfig,
    originConnectionId: args.originConnectionId
  })
}

describe('resolveAgentAccountResumeLaunchConfig', () => {
  afterEach(() => vi.unstubAllGlobals())

  beforeEach(() => {
    vi.stubGlobal('window', {
      api: { platform: { get: () => ({ homeDirectory: 'C:/Users/ada' }) } }
    })
    state = {
      settings: { piLaunchProfiles: [], claudeLaunchProfiles: [] },
      repos: [{ id: 'repo-1', connectionId: null }],
      worktreesByRepo: { 'repo-1': [{ id: 'wt-1', repoId: 'repo-1', path: 'C:/repo' }] },
      projects: [{ id: 'repo-1', localWindowsRuntimePreference: { kind: 'windows-host' } }],
      folderWorkspaces: [],
      projectGroups: [],
      activeRepoId: 'repo-1',
      activeWorktreeId: 'wt-1',
      sshConnectionStates: new Map()
    }
  })

  it('resumes an SSH Pi transcript with the profile whose home-relative root owns it', () => {
    useSshWorkspace('/home/agent')
    state.settings.piLaunchProfiles = [piWork]

    expect(
      resolve({
        agent: 'pi',
        transcriptPath: '/home/agent/.pi/agent-work/sessions/--repo--/session.jsonl',
        originConnectionId: 'ssh-1',
        executionHostId: 'ssh:ssh-1'
      })
    ).toEqual({
      ok: true,
      launchConfig: {
        agentCommand: 'piw',
        agentArgs: expect.any(String),
        agentEnv: expect.objectContaining({
          PI_CODING_AGENT_DIR: '/home/agent/.pi/agent-work',
          ORCA_PI_SOURCE_AGENT_DIR: '/home/agent/.pi/agent-work'
        })
      }
    })
  })

  it('keeps the SSH host default Pi account for transcripts under its own ~/.pi/agent', () => {
    useSshWorkspace('/home/agent')
    state.settings.piLaunchProfiles = [piWork]

    const resolution = resolve({
      agent: 'pi',
      transcriptPath: '/home/agent/.pi/agent/sessions/--repo--/session.jsonl',
      originConnectionId: 'ssh-1',
      executionHostId: 'ssh:ssh-1'
    })

    expect(resolution.ok).toBe(true)
    expect(resolution.ok && resolution.launchConfig?.agentCommand).toBeFalsy()
  })

  it('refuses an SSH Pi transcript that only resembles a profile root under another home', () => {
    useSshWorkspace('/home/agent')
    state.settings.piLaunchProfiles = [piWork]

    expect(
      resolve({
        agent: 'pi',
        transcriptPath: '/srv/other/.pi/agent-work/sessions/--repo--/session.jsonl',
        originConnectionId: 'ssh-1',
        executionHostId: 'ssh:ssh-1'
      }).ok
    ).toBe(false)
  })

  it('waits for the SSH host home before choosing a remote profile', () => {
    useSshWorkspace(undefined)
    state.settings.piLaunchProfiles = [piWork]

    expect(
      resolve({
        agent: 'pi',
        transcriptPath: '/home/agent/.pi/agent-work/sessions/--repo--/session.jsonl',
        originConnectionId: 'ssh-1',
        executionHostId: 'ssh:ssh-1'
      })
    ).toEqual({ ok: false, message: expect.stringContaining('home directory') })
  })

  it('keeps the captured SSH launch when no profile has a remote root', () => {
    useSshWorkspace('/home/agent')
    state.settings.piLaunchProfiles = [{ ...piWork, remoteAgentDirectory: undefined }]
    const capturedLaunchConfig = { agentCommand: 'remote-pi', agentArgs: '', agentEnv: {} }

    expect(
      resolve({
        agent: 'pi',
        transcriptPath: '/home/agent/.pi/agent-work/sessions/--repo--/session.jsonl',
        originConnectionId: 'ssh-1',
        capturedLaunchConfig,
        executionHostId: 'ssh:ssh-1'
      })
    ).toEqual({ ok: true, launchConfig: capturedLaunchConfig })
  })

  it('does not select a remote profile for a session whose origin host was not this SSH host', () => {
    useSshWorkspace('/home/agent')
    state.settings.piLaunchProfiles = [piWork]

    expect(
      resolve({
        agent: 'pi',
        transcriptPath: '/home/agent/.pi/agent-work/sessions/--repo--/session.jsonl',
        originConnectionId: undefined,
        executionHostId: 'ssh:ssh-1'
      }).ok
    ).toBe(false)
  })

  it('resumes a local personal Claude transcript with its profile instead of the captured work command', () => {
    state.settings.claudeLaunchProfiles = [claudePersonal, claudeWork]

    expect(
      resolve({
        agent: 'claude',
        transcriptPath: 'C:/Users/ada/.claude/projects/C--repo/session.jsonl',
        originConnectionId: null,
        capturedLaunchConfig: { agentCommand: 'ccw', agentArgs: '--verbose', agentEnv: {} }
      })
    ).toEqual({
      ok: true,
      launchConfig: {
        agentCommand: 'cc',
        agentArgs: '--verbose',
        agentEnv: { CLAUDE_CONFIG_DIR: 'C:/Users/ada/.claude' }
      }
    })
  })

  it('resumes an SSH Claude transcript with the remote root of its profile', () => {
    useSshWorkspace('/home/agent')
    state.settings.claudeLaunchProfiles = [claudePersonal, claudeWork]

    const resolution = resolve({
      agent: 'claude',
      transcriptPath: '/home/agent/.claude-work/projects/-home-agent-repo/session.jsonl',
      originConnectionId: 'ssh-1',
      executionHostId: 'ssh:ssh-1'
    })

    expect(resolution).toEqual({
      ok: true,
      launchConfig: expect.objectContaining({
        agentCommand: 'ccw',
        agentEnv: expect.objectContaining({ CLAUDE_CONFIG_DIR: '/home/agent/.claude-work' })
      })
    })
  })

  it.each(['local', 'ssh'] as const)(
    'pins default Claude history to the personal account on %s despite a work override',
    (host) => {
      const remote = host === 'ssh'
      if (remote) {
        useSshWorkspace('/home/agent')
      }
      state.settings.claudeLaunchProfiles = [claudeWork]
      const root = remote ? '/home/agent/.claude' : 'C:/Users/ada/.claude'
      expect(
        resolve({
          agent: 'claude',
          transcriptPath: `${root}/projects/repo/session.jsonl`,
          originConnectionId: remote ? 'ssh-1' : null,
          executionHostId: remote ? 'ssh:ssh-1' : 'local',
          capturedLaunchConfig: {
            agentCommand: 'ccw',
            agentArgs: '--verbose',
            agentEnv: { CLAUDE_CONFIG_DIR: 'C:/Users/ada/.claude-work', OTHER: 'preserved' }
          }
        })
      ).toEqual({
        ok: true,
        launchConfig: {
          agentCommand: 'claude',
          agentArgs: '--verbose',
          agentEnv: { OTHER: 'preserved' }
        }
      })
    }
  )

  it('leaves the default Claude OAuth identity unpinned when no config override was captured', () => {
    state.settings.claudeLaunchProfiles = [claudeWork]
    expect(
      resolve({
        agent: 'claude',
        transcriptPath: 'C:/Users/ada/.claude/projects/repo/session.jsonl',
        originConnectionId: null,
        capturedLaunchConfig: { agentCommand: 'ccw', agentArgs: '', agentEnv: {} }
      })
    ).toEqual({
      ok: true,
      launchConfig: { agentCommand: 'claude', agentArgs: '', agentEnv: {} }
    })
  })

  it('keeps a matching captured Claude account command after its profile changes', () => {
    state.settings.claudeLaunchProfiles = [{ ...claudeWork, command: 'new-wrapper' }]
    const capturedLaunchConfig = {
      agentCommand: 'old-wrapper',
      agentArgs: '',
      agentEnv: { CLAUDE_CONFIG_DIR: claudeWork.agentDirectory }
    }
    expect(
      resolve({
        agent: 'claude',
        transcriptPath: `${claudeWork.agentDirectory}/projects/repo/session.jsonl`,
        originConnectionId: null,
        capturedLaunchConfig
      })
    ).toEqual({ ok: true, launchConfig: capturedLaunchConfig })
  })

  it('does not guess a personal Claude account from another host or a suffix', () => {
    state.settings.claudeLaunchProfiles = [claudeWork]
    const capturedLaunchConfig = { agentCommand: 'recorded-command', agentArgs: '', agentEnv: {} }
    for (const transcriptPath of [
      'C:/Users/other/.claude/projects/repo/session.jsonl',
      'C:/Users/ada/.claude-other/projects/repo/session.jsonl'
    ]) {
      expect(
        resolve({ agent: 'claude', transcriptPath, originConnectionId: null, capturedLaunchConfig })
      ).toEqual({ ok: true, launchConfig: capturedLaunchConfig })
    }
    useSshWorkspace('/home/agent')
    expect(
      resolve({
        agent: 'claude',
        transcriptPath: '/home/agent/.claude/projects/repo/session.jsonl',
        originConnectionId: 'another-ssh-host',
        executionHostId: 'ssh:ssh-1',
        capturedLaunchConfig
      })
    ).toEqual({ ok: true, launchConfig: capturedLaunchConfig })
  })

  it('leaves agents without profiles untouched', () => {
    const capturedLaunchConfig = { agentCommand: 'codex', agentArgs: '', agentEnv: {} }
    expect(resolve({ agent: 'codex', originConnectionId: null, capturedLaunchConfig })).toEqual({
      ok: true,
      launchConfig: capturedLaunchConfig
    })
  })
})
