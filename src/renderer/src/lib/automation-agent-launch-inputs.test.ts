import { describe, expect, it } from 'vitest'
import { resolveAutomationAgentLaunchInputs } from './automation-agent-launch-inputs'

const workProfile = {
  id: 'work',
  name: 'ccw',
  command: 'ccw',
  agentDirectory: '/home/ada/.claude-work'
}
const settings = { claudeLaunchProfiles: [workProfile], piLaunchProfiles: [] }

describe('resolveAutomationAgentLaunchInputs', () => {
  it('leaves an automation without picks on the default launch', () => {
    expect(resolveAutomationAgentLaunchInputs(settings, { agentId: 'claude' })).toEqual({})
  })

  it('resolves the saved profile and turns preferences into session options', () => {
    expect(
      resolveAutomationAgentLaunchInputs(settings, {
        agentId: 'claude',
        agentProfileId: 'work',
        launchPreferences: { model: 'opus', effort: 'high' }
      })
    ).toEqual({
      agentLaunchProfile: workProfile,
      sessionOptions: { model: 'opus', effort: 'high' }
    })
  })

  it('fails a run whose profile was deleted rather than launching another account', () => {
    expect(() =>
      resolveAutomationAgentLaunchInputs(
        { claudeLaunchProfiles: [] },
        { agentId: 'claude', agentProfileId: 'work' }
      )
    ).toThrow('no longer exists')
  })
})
