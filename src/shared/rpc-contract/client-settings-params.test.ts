import { describe, expect, it } from 'vitest'
import { SettingsUpdate } from './client-settings-params'

describe('SettingsUpdate linked work-item prompt templates', () => {
  it('does not expose agent launch profiles to paired clients', () => {
    const profiles = [
      { id: 'work', name: 'Work', command: 'piw', agentDirectory: '/accounts/work' }
    ]
    expect(SettingsUpdate.safeParse({ piLaunchProfiles: profiles }).success).toBe(false)
    expect(SettingsUpdate.safeParse({ claudeLaunchProfiles: profiles }).success).toBe(false)
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
