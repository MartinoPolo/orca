import { describe, expect, it } from 'vitest'
import type { AgentProfileSelection } from '../../../../shared/agent-launch-profile-agents'
import { assertPendingCreationAccountMatches } from './pending-account-startup'
import { buildQuickComposerStartup } from './quick-startup-plan'

const launch = {
  settings: undefined,
  launchHost: { kind: 'known', platform: 'linux', hostKind: 'local' },
  shell: undefined,
  isRemote: false
} as const
const scope = { kind: 'local', homeDirectory: '/home/me' } as const
const workProfile: AgentProfileSelection = {
  agent: 'pi',
  profile: { id: 'work', name: 'piw', command: '/tools/piw', agentDirectory: '/accounts/work' }
}

function pendingPiCreation(agentProfile?: AgentProfileSelection) {
  const { startupPlan, backendStartup } = buildQuickComposerStartup({
    ...launch,
    agent: 'pi',
    agentProfile,
    prompt: '',
    draftPrompt: null,
    telemetrySource: undefined
  })
  return { agent: 'pi' as const, startupPlan, startup: backendStartup }
}

describe('assertPendingCreationAccountMatches', () => {
  it('reopens a pending creation under the account it was started with', () => {
    expect(() =>
      assertPendingCreationAccountMatches({
        requestedAgent: 'pi',
        agentProfile: undefined,
        pendingRequest: pendingPiCreation(),
        scope,
        launch
      })
    ).not.toThrow()
    expect(() =>
      assertPendingCreationAccountMatches({
        requestedAgent: 'pi',
        agentProfile: workProfile,
        pendingRequest: pendingPiCreation(workProfile),
        scope,
        launch
      })
    ).not.toThrow()
  })

  it('refuses to switch a pending creation to another account', () => {
    expect(() =>
      assertPendingCreationAccountMatches({
        requestedAgent: 'pi',
        agentProfile: workProfile,
        pendingRequest: pendingPiCreation(),
        scope,
        launch
      })
    ).toThrow('different Pi account')
    expect(() =>
      assertPendingCreationAccountMatches({
        requestedAgent: 'pi',
        agentProfile: undefined,
        pendingRequest: pendingPiCreation(workProfile),
        scope,
        launch
      })
    ).toThrow('different Pi account')
  })

  it('leaves targets without a profile scope to the existing pending flow', () => {
    expect(() =>
      assertPendingCreationAccountMatches({
        requestedAgent: 'pi',
        agentProfile: undefined,
        pendingRequest: pendingPiCreation(workProfile),
        scope: null,
        launch
      })
    ).not.toThrow()
  })
})
