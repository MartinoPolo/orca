import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildClaudeLaunchProfileEnv } from '../../../shared/claude-launch-profiles'

const managedAccountEnv = {
  ORCA_CLAUDE_PROFILE_POINTER: '/orca/claude-profile-pointer',
  ORCA_CLAUDE_INJECTED_CONFIG_DIR: '/orca/accounts/managed',
  CLAUDE_CONFIG_DIR: '/orca/accounts/managed'
}

vi.mock('../../claude-accounts/claude-profile-installed-router', () => ({
  withClaudeProfileTerminalEnv: (env: Record<string, string> | undefined) => ({
    ...env,
    ...managedAccountEnv
  })
}))

import { resolveSpawnClaudeAccount } from './spawn-claude-account'

const managedAuth = {
  configDir: '/orca/accounts/managed',
  runtime: 'host' as const,
  envPatch: { CLAUDE_CONFIG_DIR: '/orca/accounts/managed' },
  provenance: 'profile:managed'
}

describe('resolveSpawnClaudeAccount', () => {
  const prepareClaudeAuth = vi.fn(async () => managedAuth)

  beforeEach(() => {
    prepareClaudeAuth.mockClear()
  })

  it('keeps managed account routing when no launch profile is selected', async () => {
    const result = await resolveSpawnClaudeAccount(
      { CLAUDE_CONFIG_DIR: '/home/user/.claude-own' },
      { runtime: 'host' },
      true,
      prepareClaudeAuth
    )

    expect(result).toEqual({ env: managedAccountEnv, claudeAuth: managedAuth })
  })

  it('lets a named Claude launch profile win over the managed account', async () => {
    const profileEnv = {
      PATH: '/usr/bin',
      ...buildClaudeLaunchProfileEnv({
        id: 'work',
        name: 'Work',
        command: 'claude',
        agentDirectory: '/home/user/.claude-work'
      })
    }

    const result = await resolveSpawnClaudeAccount(
      profileEnv,
      { runtime: 'host' },
      true,
      prepareClaudeAuth
    )

    expect(result).toEqual({ env: profileEnv, claudeAuth: null })
    expect(prepareClaudeAuth).not.toHaveBeenCalled()
  })
})
