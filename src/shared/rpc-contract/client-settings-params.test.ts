import { describe, expect, it } from 'vitest'
import { SettingsUpdate } from './client-settings-params'

describe('SettingsUpdate linked work-item prompt templates', () => {
  it('accepts and normalizes known per-agent templates', () => {
    expect(
      SettingsUpdate.parse({
        agentLinkedWorkItemPromptTemplates: {
          pi: '  /skill:mpx-execute {{artifact_url}}  ',
          codex: '   ',
          unknown: 'ignore me'
        }
      })
    ).toEqual({
      agentLinkedWorkItemPromptTemplates: {
        pi: '/skill:mpx-execute {{artifact_url}}'
      }
    })
  })
})
