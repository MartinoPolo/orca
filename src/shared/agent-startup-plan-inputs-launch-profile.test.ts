import { describe, expect, it } from 'vitest'
import { resolveAgentStartupPlanInputs } from './agent-startup-plan-inputs'
import { buildAgentStartupPlan } from './tui-agent-startup'

describe('resolveAgentStartupPlanInputs with a launch profile', () => {
  const workProfile = {
    id: 'work',
    name: 'ccw',
    command: 'ccw',
    agentDirectory: 'C:\\Users\\me\\.claude-work'
  }

  it("runs the profile's command and records its account root for resume", () => {
    const inputs = resolveAgentStartupPlanInputs({
      agent: 'claude',
      settings: { agentCmdOverrides: { claude: 'cc', pi: 'pi' } },
      platform: 'win32',
      isRemote: false,
      shell: undefined,
      launchProfile: workProfile
    })
    const plan = buildAgentStartupPlan({
      ...inputs,
      prompt: '',
      allowEmptyPromptLaunch: true
    })

    expect(inputs.cmdOverrides).toEqual({ claude: 'ccw', pi: 'pi' })
    expect(plan?.launchCommand.startsWith('ccw')).toBe(true)
    expect(plan?.launchConfig.agentEnv).toMatchObject({
      CLAUDE_CONFIG_DIR: workProfile.agentDirectory,
      ORCA_CLAUDE_LAUNCH_PROFILE: 'work'
    })
  })

  it('refuses a profile for an agent that has none', () => {
    expect(() =>
      resolveAgentStartupPlanInputs({
        agent: 'codex',
        settings: {},
        platform: 'win32',
        isRemote: false,
        shell: undefined,
        launchProfile: workProfile
      })
    ).toThrow('Launch profiles are not available for codex.')
  })
})
