import { describe, expect, it } from 'vitest'
import { resolveQuickSubmitProfileOptions } from './quick-submit-profile-options'

const profile = {
  id: 'work',
  name: 'ccw',
  command: 'ccw',
  agentDirectory: '/accounts/claude-work'
}
const settings = { piLaunchProfiles: [], claudeLaunchProfiles: [profile] }
const localScope = { kind: 'local', homeDirectory: undefined } as const

describe('resolveQuickSubmitProfileOptions', () => {
  it('forces a picked profile onto a terminal launch even when chat was chosen', () => {
    expect(
      resolveQuickSubmitProfileOptions(
        {
          setupOnly: false,
          launchChoice: { agent: 'claude', route: 'structured-native-chat' },
          agentProfile: { agent: 'claude', profile }
        },
        settings,
        localScope
      )
    ).toEqual({
      setupOnly: false,
      launchChoice: { agent: 'claude', route: 'terminal-tui', requestedSurface: 'terminal' },
      agentProfile: { agent: 'claude', profile }
    })
  })

  it('leaves options without a profile untouched', () => {
    const options = { setupOnly: false }
    expect(resolveQuickSubmitProfileOptions(options, settings, null)).toBe(options)
    expect(resolveQuickSubmitProfileOptions(undefined, settings, null)).toBeUndefined()
  })

  it('refuses a profile that is no longer registered instead of launching the default account', () => {
    expect(() =>
      resolveQuickSubmitProfileOptions(
        { agentProfile: { agent: 'claude', profile } },
        { piLaunchProfiles: [], claudeLaunchProfiles: [] },
        localScope
      )
    ).toThrow('unavailable')
  })
})
