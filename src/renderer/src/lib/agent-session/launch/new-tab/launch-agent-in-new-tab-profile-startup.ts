import type { AppState } from '@/store/types'
import type { LaunchAgentInNewTabArgs } from '@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab-args'
import { resolveAgentProfileLaunchInputs } from '@/lib/agent-profile-launch-inputs'
import { CLIENT_PLATFORM } from '@/lib/workspace/creation/new-workspace'
import {
  resolveAgentStartupPlanInputs,
  type AgentStartupPlanInputs
} from '../../../../../../shared/agent-launch/startup/agent-startup-plan-inputs'

type AgentStartupPlanInputsRequest = Parameters<typeof resolveAgentStartupPlanInputs>[0]

/** Layers the tab's launch profile command and account root over startup inputs; `null` when the profile cannot run on this target. */
export function createProfileStartupInputsResolver(
  store: AppState,
  args: Pick<LaunchAgentInNewTabArgs, 'agent' | 'agentLaunchProfile' | 'worktreeId'>,
  resolvedLaunchPlatform: NodeJS.Platform
): ((request: AgentStartupPlanInputsRequest) => AgentStartupPlanInputs) | null {
  const agentProfileInputs = resolveAgentProfileLaunchInputs({
    agent: args.agent,
    profile: args.agentLaunchProfile,
    state: store,
    worktreeId: args.worktreeId,
    resolvedLaunchPlatform,
    clientPlatform: CLIENT_PLATFORM,
    commandOverrides: {},
    environment: {}
  })
  if (!agentProfileInputs.ok) {
    return null
  }
  return (request) => {
    const base = resolveAgentStartupPlanInputs({
      ...request,
      settings: {
        ...request.settings,
        agentCmdOverrides: {
          ...request.settings.agentCmdOverrides,
          ...agentProfileInputs.commandOverrides
        }
      }
    })
    return { ...base, agentEnv: { ...base.agentEnv, ...agentProfileInputs.environment } }
  }
}
