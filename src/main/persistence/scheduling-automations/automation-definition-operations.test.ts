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
  projectId: 'repo-1',
  workspaceMode: 'new_per_run',
  timezone: 'UTC',
  rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0',
  dtstart: 0
}

describe('automation launch profile persistence', () => {
  it('stores the account pick with the record', () => {
    expect(createAutomation(operations(), input)).toMatchObject({ agentProfileId: 'work' })
  })

  it('drops a pick the agent cannot launch with', () => {
    expect(createAutomation(operations(), { ...input, agentId: 'codex' })).not.toHaveProperty(
      'agentProfileId'
    )
  })

  it('keeps the pick when an update omits it and clears it on an empty id or agent change', () => {
    const store = operations()
    const created = createAutomation(store, input)

    expect(updateAutomation(store, created.id, { name: 'Renamed' })).toMatchObject({
      agentProfileId: 'work'
    })
    expect(updateAutomation(store, created.id, { agentProfileId: '' })).not.toHaveProperty(
      'agentProfileId'
    )

    const repinned = updateAutomation(store, created.id, { agentProfileId: 'work' })
    expect(updateAutomation(store, repinned.id, { agentId: 'codex' })).not.toHaveProperty(
      'agentProfileId'
    )
  })
})
