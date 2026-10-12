import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentLaunchProfile } from '../../../shared/agent-launch-profiles'

const hostScope: { status: string } = { status: 'resolved' }
const store = {
  settings: {
    agentCmdOverrides: { claude: 'cc' },
    agentDefaultArgs: { claude: '--verbose' },
    agentDefaultEnv: {}
  },
  repos: [{ id: 'repo-1', connectionId: null, path: '/repo' }],
  getKnownWorktreeById: (worktreeId: string) =>
    worktreeId === 'wt-1' ? { id: 'wt-1', repoId: 'repo-1', path: '/repo/worktree' } : undefined
}

vi.mock('@/store', () => ({ useAppStore: { getState: () => store } }))
vi.mock('@/lib/new-workspace', () => ({ CLIENT_PLATFORM: 'linux' }))
vi.mock('@/lib/agent-background-session-launch-host', () => ({
  resolveAgentBackgroundLaunchHost: () => ({
    connectionId: null,
    platform: 'linux',
    isRemote: false,
    expectedConnectionId: null
  })
}))
vi.mock('@/lib/agent-profile-launch-target', () => ({
  resolveAgentProfileHostScope: () =>
    hostScope.status === 'resolved'
      ? { status: 'resolved', scope: { kind: 'local', homeDirectory: undefined } }
      : { status: hostScope.status }
}))

const workProfile: AgentLaunchProfile = {
  id: 'work',
  name: 'ccw',
  command: 'ccw',
  agentDirectory: '/home/ada/.claude-work'
}

describe('planAgentBackgroundSession', () => {
  beforeEach(() => {
    hostScope.status = 'resolved'
  })

  it('launches the configured command when no profile or model is picked', async () => {
    const { planAgentBackgroundSession } = await import('./agent-background-session-startup')

    const plan = planAgentBackgroundSession({ agent: 'claude', worktreeId: 'wt-1', prompt: 'go' })

    expect(plan?.startupPlan.launchCommand).toBe("cc '--verbose' 'go'")
    expect(plan?.startupPlan.launchConfig.agentEnv).toEqual({})
  })

  it('applies the profile account and the picked model and effort', async () => {
    const { planAgentBackgroundSession } = await import('./agent-background-session-startup')

    const plan = planAgentBackgroundSession({
      agent: 'claude',
      worktreeId: 'wt-1',
      prompt: 'go',
      agentLaunchProfile: workProfile,
      sessionOptions: { model: 'opus', effort: 'max' }
    })

    expect(plan?.startupPlan.launchCommand).toBe(
      "ccw '--verbose' '--model' 'opus' '--effort' 'max' 'go'"
    )
    expect(plan?.startupPlan.env).toMatchObject({ CLAUDE_CONFIG_DIR: '/home/ada/.claude-work' })
    // Resume restores the provider session's own model, so only the account survives.
    expect(plan?.startupPlan.launchConfig).toEqual({
      agentCommand: "ccw '--verbose'",
      agentArgs: '--verbose',
      agentEnv: expect.objectContaining({ CLAUDE_CONFIG_DIR: '/home/ada/.claude-work' })
    })
  })

  it('refuses a profile the workspace host cannot use instead of falling back', async () => {
    hostScope.status = 'unresolved'
    const { planAgentBackgroundSession } = await import('./agent-background-session-startup')

    expect(() =>
      planAgentBackgroundSession({
        agent: 'claude',
        worktreeId: 'wt-1',
        prompt: 'go',
        agentLaunchProfile: workProfile
      })
    ).toThrow('Launch profile "ccw" is not available')
  })
})
