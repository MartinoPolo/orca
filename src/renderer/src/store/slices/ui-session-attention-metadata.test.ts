import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUIStore, makePersistedUI } from './ui-slice-test-harness'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createUISlice session attention metadata actions', () => {
  it('keeps saved markers independent from priority and acknowledgement turns', () => {
    const store = createUIStore()
    vi.spyOn(Date, 'now').mockReturnValue(123)

    store.getState().setSessionSavedMarker('stable-session', 'teal')
    store.getState().setSessionPriority('stable-session', 5)
    store.getState().acknowledgeAgents(['unrelated-pane'])

    expect(store.getState().sessionAttentionMetadataByIdentity['stable-session']).toEqual({
      priority: 5,
      savedColor: 'teal',
      savedAt: 123
    })

    store.getState().setSessionSavedMarker('stable-session', null)
    expect(store.getState().sessionAttentionMetadataByIdentity['stable-session']).toEqual({
      priority: 5
    })
  })

  it('preserves the saved episode start when only its color changes', () => {
    const store = createUIStore()
    vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(200)
    store.getState().setSessionSavedMarker('stable-session', 'blue')
    store.getState().setSessionSavedMarker('stable-session', 'rose')
    expect(store.getState().sessionAttentionMetadataByIdentity['stable-session']).toEqual({
      priority: 3,
      savedColor: 'rose',
      savedAt: 100
    })
  })
})

describe('createUISlice hydratePersistedUI session attention metadata', () => {
  it('restores valid priority and saved markers without pane-key fallback', () => {
    const store = createUIStore()
    store.getState().hydratePersistedUI(
      makePersistedUI({
        sessionAttentionMetadataByIdentity: {
          stable: { priority: 5, savedColor: 'rose', savedAt: 123 }
        }
      })
    )

    expect(store.getState().sessionAttentionMetadataByIdentity).toEqual({
      stable: { priority: 5, savedColor: 'rose', savedAt: 123 }
    })
  })

  it('defaults to an empty record for older profiles', () => {
    const store = createUIStore()
    store
      .getState()
      .hydratePersistedUI(makePersistedUI({ sessionAttentionMetadataByIdentity: undefined }))
    expect(store.getState().sessionAttentionMetadataByIdentity).toEqual({})
  })
})
