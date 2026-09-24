import { describe, expect, it } from 'vitest'
import { resolveQuickCreateLinkedWorkItemPrompt } from '@/lib/linked-work-item-context'
import { buildQuickComposerStartup } from './quick-startup-plan'

const LINKED_ISSUE_URL = 'https://github.com/stablyai/orca/issues/42'

describe('buildQuickComposerStartup linked work-item drafts', () => {
  it('uses the selected Pi command and account for a linked draft, without changing default Pi', () => {
    const input = {
      agent: 'pi' as const,
      prompt: '',
      draftPrompt: '/skill:mpx-execute https://example.com/issue',
      settings: undefined,
      repoConnectionId: null,
      platform: 'linux' as const,
      shell: undefined,
      isRemote: false,
      telemetrySource: 'sidebar' as const
    }
    const profile = {
      id: 'work',
      name: 'piw',
      command: '/tools/piw',
      agentDirectory: '/accounts/work'
    }
    const named = buildQuickComposerStartup({ ...input, piProfile: profile })
    expect(named.startupPlan?.launchCommand).toContain('/tools/piw')
    expect(named.backendStartup?.command).toContain('/tools/piw')
    expect(named.backendStartup?.env).toMatchObject({
      PI_CODING_AGENT_DIR: '/accounts/work',
      ORCA_PI_SOURCE_AGENT_DIR: '/accounts/work',
      ORCA_PI_PREFILL: input.draftPrompt
    })
    const plain = buildQuickComposerStartup({
      ...input,
      draftPrompt: null,
      prompt: 'start here',
      piProfile: profile
    })
    expect(plain.startupPlan?.launchConfig.agentCommand).toContain('/tools/piw')
    expect(plain.startupPlan?.launchConfig.agentEnv).toMatchObject({
      PI_CODING_AGENT_DIR: '/accounts/work'
    })
    expect(plain.startupPlan?.env?.ORCA_PI_SOURCE_AGENT_DIR).toBe('/accounts/work')
    const builtIn = buildQuickComposerStartup(input)
    expect(builtIn.startupPlan?.launchCommand).not.toContain('/tools/piw')
    expect(builtIn.backendStartup?.env?.PI_CODING_AGENT_DIR).toBeUndefined()
  })

  it.each([
    ['local', false, null],
    ['remote', true, 'ssh-1']
  ] as const)(
    'transports a configured Pi template for %s targets',
    (_target, isRemote, repoConnectionId) => {
      const resolvedPrompt = resolveQuickCreateLinkedWorkItemPrompt(
        {
          provider: 'github',
          number: 42,
          url: LINKED_ISSUE_URL,
          title: 'Restore linked quick-create'
        },
        'inspect failures first',
        '/skill:mpx-execute {{artifact_url}}'
      )
      const result = buildQuickComposerStartup({
        agent: 'pi',
        prompt: resolvedPrompt.prompt,
        draftPrompt: resolvedPrompt.draftPrompt,
        settings: undefined,
        repoConnectionId,
        platform: 'linux',
        shell: undefined,
        isRemote,
        telemetrySource: 'sidebar'
      })

      const expectedDraft = `inspect failures first\n\n/skill:mpx-execute ${LINKED_ISSUE_URL}`
      expect(resolvedPrompt.prompt).toBe('')
      expect(result.startupPlan?.env?.ORCA_PI_PREFILL).toBe(expectedDraft)
      expect(result.startupPlan?.followupPrompt).toBeNull()
      expect(result.backendStartup?.env?.ORCA_PI_PREFILL).toBe(expectedDraft)
    }
  )
})
