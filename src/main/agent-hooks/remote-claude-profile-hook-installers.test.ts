import type { SFTPWrapper } from 'ssh2'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { claudeHookService } from '../claude/hook-service'
import { installRemoteManagedAgentHooks } from './remote-managed-hook-installers'

afterEach(() => vi.restoreAllMocks())

describe('remote Claude profile hook roots', () => {
  it('installs into each profile config root after the default one', async () => {
    const install = vi
      .spyOn(claudeHookService, 'installRemote')
      .mockImplementation(async (_sftp, _home, options) => ({
        agent: 'claude',
        state: 'installed',
        configPath: `${options?.configDirectory ?? '/home/dev/.claude'}/settings.json`,
        managedHooksPresent: true,
        detail: null
      }))
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the spied installer never touches SFTP.
    const sftp = {} as SFTPWrapper

    const results = await installRemoteManagedAgentHooks(sftp, '/home/dev', {
      agents: ['claude'],
      claudeVersion: '2.1.261',
      claudeConfigDirectories: ['~/.claude-work', '~/../escape']
    })

    expect(results.map((result) => result.configPath)).toEqual([
      '/home/dev/.claude/settings.json',
      '/home/dev/.claude-work/settings.json'
    ])
    expect(install).toHaveBeenLastCalledWith(sftp, '/home/dev', {
      claudeVersion: '2.1.261',
      configDirectory: '/home/dev/.claude-work'
    })
  })
})
