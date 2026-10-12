import { describe, expect, it, vi } from 'vitest'
import type { AutomationCreateInput } from '../../../shared/automations-types'
import { getDefaultPersistedState } from '../../../shared/constants'
import {
  createAutomation,
  updateAutomation,
  type AutomationDefinitionOperations
} from './automation-definition-operations'

function operations(): AutomationDefinitionOperations {
  const state = getDefaultPersistedState('/home/ada')
  state.repos = [
    { id: 'repo-1', path: '/repo', displayName: 'Repo', badgeColor: '#000', addedAt: 1 }
  ]
  return { state, storageAuthority: 'desktop', flush: vi.fn(), recordCreated: vi.fn() }
}

const input: AutomationCreateInput = {
  name: 'Nightly',
  prompt: 'go',
  agentId: 'claude',
  agentProfileId: 'work',
  launchPreferences: { model: 'opus', effort: 'max' },
  projectId: 'repo-1',
  workspaceMode: 'new_per_run',
  timezone: 'UTC',
  rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0',
  dtstart: 0
}

describe('automation launch selection persistence', () => {
  it('stores the account and model picks with the record', () => {
    const created = createAutomation(operations(), input)

    expect(created).toMatchObject({
      agentProfileId: 'work',
      launchPreferences: { model: 'opus', effort: 'max' }
    })
  })

  it('drops picks the agent cannot launch with and effort without a model', () => {
    const created = createAutomation(operations(), {
      ...input,
      agentId: 'claude',
      launchPreferences: { effort: 'max' }
    })
    const codexWithProfile = createAutomation(operations(), { ...input, agentId: 'codex' })

    expect(created).not.toHaveProperty('launchPreferences')
    expect(codexWithProfile).not.toHaveProperty('agentProfileId')
  })

  it('clears picks on an explicit null and keeps them when the update omits them', () => {
    const store = operations()
    const created = createAutomation(store, input)

    const renamed = updateAutomation(store, created.id, { name: 'Renamed' })
    expect(renamed).toMatchObject({ agentProfileId: 'work', launchPreferences: { model: 'opus' } })

    const cleared = updateAutomation(store, created.id, {
      agentProfileId: null,
      launchPreferences: null
    })
    expect(cleared).not.toHaveProperty('agentProfileId')
    expect(cleared).not.toHaveProperty('launchPreferences')
  })
})
