import { describe, expect, it } from 'vitest'
import { buildFolderWorkspaceLinkedStartupPlan } from './folder-workspace-composer-submit'

describe('buildFolderWorkspaceLinkedStartupPlan', () => {
  it('preserves the named Pi command and account in a folder linked draft', () => {
    const plan = buildFolderWorkspaceLinkedStartupPlan({
      agent: 'pi',
      linkedWorkItem: {
        provider: 'github',
        type: 'issue',
        number: 42,
        title: 'Review',
        url: 'https://example.com/42',
        repoId: 'repo-1'
      },
      note: '',
      agentCmdOverrides: { pi: '/tools/piw' },
      agentEnv: {
        PI_CODING_AGENT_DIR: '/accounts/work',
        ORCA_PI_SOURCE_AGENT_DIR: '/accounts/work'
      },
      platform: 'linux',
      isRemote: false
    })
    expect(plan?.launchCommand).toContain('/tools/piw')
    expect(plan?.env).toMatchObject({
      PI_CODING_AGENT_DIR: '/accounts/work',
      ORCA_PI_SOURCE_AGENT_DIR: '/accounts/work',
      ORCA_PI_PREFILL: expect.stringContaining('https://example.com/42')
    })
  })

  it('uses cmd quoting for configured arguments on local Windows', () => {
    const plan = buildFolderWorkspaceLinkedStartupPlan({
      agent: 'hermes',
      linkedWorkItem: {
        provider: 'github',
        type: 'issue',
        number: 42,
        title: 'Restore linked quick-create',
        url: 'https://github.com/stablyai/orca/issues/42',
        repoId: 'repo-1'
      },
      note: '',
      agentCmdOverrides: {},
      agentArgs: '--provider "value with space"',
      platform: 'win32',
      shell: 'cmd',
      isRemote: false
    })

    expect(plan?.launchCommand).toBe('hermes --tui "--provider" "value with space"')
  })

  it.each([false, true])(
    'transports the configured Pi linked-work-item draft through native prefill when isRemote=%s',
    (isRemote) => {
      const plan = buildFolderWorkspaceLinkedStartupPlan({
        agent: 'pi',
        linkedWorkItem: {
          provider: 'gitlab',
          type: 'mr',
          number: 17,
          title: 'Review linked merge request',
          url: 'https://gitlab.example.com/group/project/-/merge_requests/17',
          repoId: 'repo-1'
        },
        note: '  inspect failures first  ',
        linkedWorkItemPromptTemplate: '/skill:mpx-execute {{artifact_url}}',
        agentCmdOverrides: {},
        platform: 'linux',
        isRemote
      })

      expect(plan?.env?.ORCA_PI_PREFILL).toBe(
        'inspect failures first\n\n/skill:mpx-execute https://gitlab.example.com/group/project/-/merge_requests/17'
      )
      expect(plan?.followupPrompt).toBeNull()
    }
  )
})
