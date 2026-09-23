import { describe, expect, it } from 'vitest'
import { resolveAiVaultPiLaunchInputs } from './ai-vault-pi-profile-resume'

describe('AI Vault Pi history target provenance', () => {
  it('blocks explicitly local history while the active target owner is unresolved', () => {
    expect(() =>
      resolveAiVaultPiLaunchInputs({
        agent: 'pi',
        transcriptPath: 'C:/Users/alice/.pi/agent/sessions/session-one.jsonl',
        sessionExecutionHostId: 'local',
        state: {
          activeRepoId: 'repo-1',
          activeWorktreeId: 'repo-1::worktree-1',
          folderWorkspaces: [],
          projectGroups: [],
          projects: [],
          repos: [],
          settings: null,
          worktreesByRepo: {}
        },
        agentArgs: '',
        agentEnv: {}
      })
    ).toThrow('target workspace owner is known')
  })
})
