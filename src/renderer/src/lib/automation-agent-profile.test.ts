import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentLaunchProfile } from '../../../shared/agent-launch-profiles'
import type { AgentStartupPlanInputs } from '../../../shared/agent-startup-plan-inputs'

const profileInputs = vi.hoisted(() => ({ ok: true }))

vi.mock('@/lib/new-workspace', () => ({ CLIENT_PLATFORM: 'linux' }))
vi.mock('@/lib/agent-profile-launch-inputs', () => ({
  resolveAgentProfileLaunchInputs: (args: {
    profile?: AgentLaunchProfile
    commandOverrides: Record<string, string>
    environment: Record<string, string>
  }) =>
    profileInputs.ok
      ? {
          ok: true,
          commandOverrides: args.profile
            ? { ...args.commandOverrides, claude: args.profile.command }
            : args.commandOverrides,
          environment: args.profile
            ? { ...args.environment, CLAUDE_CONFIG_DIR: args.profile.agentDirectory }
            : args.environment
        }
      : { ok: false }
}))

const workProfile: AgentLaunchProfile = {
  id: 'work',
  name: 'ccw',
  command: 'ccw',
  agentDirectory: '/home/ada/.claude-work'
}
const planInputs: AgentStartupPlanInputs = {
  agent: 'claude',
  cmdOverrides: { claude: 'cc' },
  agentArgs: '--verbose',
  agentEnv: { KEEP: '1' },
  platform: 'linux',
  shell: undefined,
  isRemote: false,
  sessionOptionsOverrideAgentArgs: false
}
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The profile resolver is mocked, so no store field is read.
const state = { settings: { claudeLaunchProfiles: [workProfile] } } as never

describe('automation agent profile', () => {
  beforeEach(() => {
    profileInputs.ok = true
  })

  it('resolves the saved profile and fails a run whose profile was deleted', async () => {
    const { resolveAutomationAgentProfile } = await import('./automation-agent-profile')
    const settings = { claudeLaunchProfiles: [workProfile] }

    expect(resolveAutomationAgentProfile(settings, { agentId: 'claude' })).toBeUndefined()
    expect(
      resolveAutomationAgentProfile(settings, {
        agentId: 'claude',
        agentProfileId: 'work'
      })
    ).toEqual(workProfile)
    expect(() =>
      resolveAutomationAgentProfile(
        { claudeLaunchProfiles: [] },
        {
          agentId: 'claude',
          agentProfileId: 'work'
        }
      )
    ).toThrow('no longer exists')
  })

  it('applies the profile command and account over the default launch inputs', async () => {
    const { applyBackgroundLaunchProfile } = await import('./automation-agent-profile')
    const launch = { state, worktreeId: 'wt-1', launchPlatform: 'linux' as const }

    expect(applyBackgroundLaunchProfile({ ...launch, planInputs, profile: undefined })).toBe(
      planInputs
    )
    expect(
      applyBackgroundLaunchProfile({ ...launch, planInputs, profile: workProfile })
    ).toMatchObject({
      cmdOverrides: { claude: 'ccw' },
      agentArgs: '--verbose',
      agentEnv: { KEEP: '1', CLAUDE_CONFIG_DIR: '/home/ada/.claude-work' }
    })
  })

  it('refuses a profile the workspace host cannot use instead of falling back', async () => {
    profileInputs.ok = false
    const { applyBackgroundLaunchProfile, resolveAutomationLaunchAccount } =
      await import('./automation-agent-profile')

    expect(() =>
      applyBackgroundLaunchProfile({
        planInputs,
        profile: workProfile,
        state,
        worktreeId: 'wt-1',
        launchPlatform: 'linux'
      })
    ).toThrow('Launch profile "ccw" is not available')
    expect(
      resolveAutomationLaunchAccount({
        state,
        agent: 'claude',
        worktreeId: 'wt-1',
        profile: workProfile
      })
    ).toBeNull()
  })
})
