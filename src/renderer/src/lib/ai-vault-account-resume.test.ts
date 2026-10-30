import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentLaunchProfile } from '../../../shared/agent-launch-profiles'
import { resolveAiVaultAccountLaunch } from './ai-vault-account-resume'

type TestState = Parameters<typeof resolveAiVaultAccountLaunch>[0]['state']

const claudeWork: AgentLaunchProfile = {
  id: 'claude-work',
  name: 'ccw',
  command: 'ccw',
  agentDirectory: 'C:/Users/ada/.claude-work'
}
const piWork: AgentLaunchProfile = {
  id: 'pi-work',
  name: 'piw',
  command: 'piw',
  agentDirectory: 'C:/Users/ada/.pi-work/agent'
}

let state: Record<string, unknown> & {
  settings: { piLaunchProfiles: AgentLaunchProfile[]; claudeLaunchProfiles: AgentLaunchProfile[] }
}

function resolve(session: { agent: 'pi' | 'claude' | 'codex'; filePath?: string }) {
  return resolveAiVaultAccountLaunch({
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The fixture supplies every field the owner and host-scope lookups read.
    state: state as unknown as TestState,
    worktreeId: 'wt-1',
    session: {
      sessionId: 'session-1',
      cwd: 'C:/repo',
      codexHome: null,
      executionHostId: 'local',
      ...session
    }
  })
}

describe('resolveAiVaultAccountLaunch', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      api: { platform: { get: () => ({ platform: 'win32', homeDirectory: 'C:/Users/ada' }) } }
    })
    state = {
      settings: { piLaunchProfiles: [piWork], claudeLaunchProfiles: [claudeWork] },
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

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('pins a history session to the profile that owns its transcript', () => {
    expect(
      resolve({ agent: 'claude', filePath: 'C:/Users/ada/.claude-work/projects/repo/s.jsonl' })
    ).toEqual({
      agentCommand: 'ccw',
      agentEnv: expect.objectContaining({ CLAUDE_CONFIG_DIR: 'C:/Users/ada/.claude-work' })
    })
    expect(
      resolve({ agent: 'pi', filePath: 'C:/Users/ada/.pi-work/agent/sessions/s.jsonl' })
    ).toEqual({
      agentCommand: 'piw',
      agentEnv: expect.objectContaining({ PI_CODING_AGENT_DIR: 'C:/Users/ada/.pi-work/agent' })
    })
  })

  it('keeps the plain resume for default-account and non-profile sessions', () => {
    expect(
      resolve({ agent: 'claude', filePath: 'C:/Users/ada/.claude/projects/repo/s.jsonl' })
    ).toBeNull()
    expect(resolve({ agent: 'pi', filePath: 'C:/Users/ada/.pi/agent/sessions/s.jsonl' })).toBeNull()
    expect(resolve({ agent: 'codex', filePath: 'C:/Users/ada/.codex/s.jsonl' })).toBeNull()
  })

  it('keeps the plain resume when the agent has no profiles', () => {
    state.settings.piLaunchProfiles = []
    expect(resolve({ agent: 'pi', filePath: 'C:/Users/ada/.pi-other/sessions/s.jsonl' })).toBeNull()
  })

  it('refuses a Pi transcript no profile or default account owns', () => {
    expect(() =>
      resolve({ agent: 'pi', filePath: 'C:/Users/ada/.pi-other/agent/sessions/s.jsonl' })
    ).toThrow('No configured Pi profile owns this transcript')
  })
})
