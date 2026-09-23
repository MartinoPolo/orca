import { describe, expect, it, vi } from 'vitest'
import { createGlobalSettingsFixture } from '../../shared/global-settings-test-fixture'
import { RuntimeClientSettingsController } from './runtime-client-settings'

describe('RuntimeClientSettingsController linked work-item templates', () => {
  it('projects templates to paired clients and persists updates', async () => {
    let settings = createGlobalSettingsFixture({
      workspaceDir: '/w',
      agentLinkedWorkItemPromptTemplates: {
        pi: '/skill:mpx-execute {{artifact_url}}'
      }
    })
    const updateSettings = vi.fn((updates) => {
      settings = { ...settings, ...updates }
    })
    const store = {
      getSettings: () => settings,
      updateSettings
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: This controller test exercises only the supplied settings methods.
    const controller = new RuntimeClientSettingsController(store as never)

    expect(controller.get().agentLinkedWorkItemPromptTemplates).toEqual({
      pi: '/skill:mpx-execute {{artifact_url}}'
    })

    await controller.update({
      agentLinkedWorkItemPromptTemplates: { codex: 'Review {{artifact_url}}' }
    })

    expect(updateSettings).toHaveBeenCalledWith(
      { agentLinkedWorkItemPromptTemplates: { codex: 'Review {{artifact_url}}' } },
      { notifyListeners: true }
    )
    expect(controller.get().agentLinkedWorkItemPromptTemplates).toEqual({
      codex: 'Review {{artifact_url}}'
    })
  })
})
