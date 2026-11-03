import { describe, expect, it, vi } from 'vitest'
import { prepareSourceControlGenerationEnvironment } from './source-control-launch-profile-environment'

const workClaude = {
  id: 'claude-work',
  name: 'ccw',
  command: 'ccw',
  agentDirectory: 'C:\\Users\\me\\.claude-work'
}
const workPi = {
  id: 'pi-work',
  name: 'piw',
  command: 'piw',
  agentDirectory: 'C:\\Users\\me\\.pi\\agent-work'
}
const settings = { claudeLaunchProfiles: [workClaude], piLaunchProfiles: [workPi] }
const params = { agentId: 'claude' as const, model: 'haiku', agentCommandOverride: 'cc' }

function claudeResolvers() {
  return {
    prepareForClaudeLaunch: vi.fn(async () => ({ envPatch: {} }) as never),
    resolveBaseEnvironment: async () => ({ PATH: '/bin' })
  }
}

describe('prepareSourceControlGenerationEnvironment', () => {
  it("runs the repository's profile command under its account root, skipping managed routing", async () => {
    const resolvers = claudeResolvers()
    const result = await prepareSourceControlGenerationEnvironment({
      params,
      repoAi: { launchProfileId: workClaude.id },
      settings,
      resolvers
    })

    expect(result).toMatchObject({
      ok: true,
      params: { agentCommandOverride: 'ccw' },
      env: {
        PATH: '/bin',
        CLAUDE_CONFIG_DIR: workClaude.agentDirectory,
        ORCA_CLAUDE_LAUNCH_PROFILE: workClaude.id
      }
    })
    expect(resolvers.prepareForClaudeLaunch).not.toHaveBeenCalled()
  })

  it('keeps the built-in account when the profile belongs to another agent or none is set', async () => {
    for (const repoAi of [{ launchProfileId: workPi.id }, undefined]) {
      const resolvers = claudeResolvers()
      const result = await prepareSourceControlGenerationEnvironment({
        params,
        repoAi,
        settings,
        resolvers
      })

      expect(result).toMatchObject({ ok: true, params: { agentCommandOverride: 'cc' } })
      expect(resolvers.prepareForClaudeLaunch).toHaveBeenCalledOnce()
    }
  })

  it('refuses a deleted profile and a WSL workspace instead of using another account', async () => {
    const deleted = await prepareSourceControlGenerationEnvironment({
      params,
      repoAi: { launchProfileId: 'removed' },
      settings,
      resolvers: claudeResolvers()
    })
    expect(deleted).toMatchObject({ ok: false, error: expect.stringMatching(/no longer exists/) })

    const wsl = await prepareSourceControlGenerationEnvironment({
      params,
      repoAi: { launchProfileId: workClaude.id },
      settings,
      resolvers: claudeResolvers(),
      target: { runtime: 'wsl', wslDistro: 'Ubuntu' }
    })
    expect(wsl).toMatchObject({ ok: false, error: expect.stringMatching(/not in WSL/) })
  })
})
