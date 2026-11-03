// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { normalizeRepoSourceControlAiOverrides } from '../../../../../../shared/source-control-ai-repo-settings'
import { withRepoAiLaunchProfile } from './repository-source-control-ai-draft'
import { RepositorySourceControlAiLaunchProfile } from './RepositorySourceControlAiLaunchProfile'

afterEach(() => cleanup())

const workClaude = {
  id: 'claude-work',
  name: 'ccw',
  command: 'ccw',
  agentDirectory: 'C:\\Users\\me\\.claude-work'
}

describe('repository text generation account', () => {
  it('persists a trimmed profile id and clears it for the default account', () => {
    expect(normalizeRepoSourceControlAiOverrides({ launchProfileId: ' claude-work ' })).toEqual({
      launchProfileId: 'claude-work'
    })
    const pinned = withRepoAiLaunchProfile({ enabled: true }, workClaude.id)
    expect(pinned).toEqual({ enabled: true, launchProfileId: workClaude.id })
    expect(withRepoAiLaunchProfile(pinned, undefined)).toEqual({ enabled: true })
  })

  it('hides the choice until a profile exists but keeps showing a pinned deleted one', () => {
    const empty = render(
      <RepositorySourceControlAiLaunchProfile value={undefined} settings={{}} onChange={() => {}} />
    )
    expect(empty.container.textContent).toBe('')
    cleanup()

    const pinned = render(
      <RepositorySourceControlAiLaunchProfile
        value="removed-profile"
        settings={{ claudeLaunchProfiles: [workClaude] }}
        onChange={() => {}}
      />
    )
    expect(pinned.container.textContent).toContain('Text generation account')
  })
})
