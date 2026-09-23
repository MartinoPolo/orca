import { describe, expect, it } from 'vitest'
import { SettingsUpdate } from './client-settings-params'

describe('SettingsUpdate linked work-item prompt templates', () => {
  it('does not expose local-native Pi launch profiles to paired clients', () => {
    expect(
      SettingsUpdate.safeParse({
        piLaunchProfiles: [
          { id: 'work', name: 'Work', command: 'piw', agentDirectory: '/accounts/work' }
        ]
      }).success
    ).toBe(false)
  })

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
