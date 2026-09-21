import { describe, expect, it } from 'vitest'
import { resolveQuickCreateLinkedWorkItemPrompt } from '@/lib/linked-work-item-context'
import { buildQuickComposerStartup } from './quick-startup-plan'

const LINKED_ISSUE_URL = 'https://github.com/stablyai/orca/issues/42'

describe('buildQuickComposerStartup linked work-item drafts', () => {
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
