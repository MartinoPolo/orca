import type { GlobalSettings } from '../../shared/global-settings-types'
import type { RepoSourceControlAiOverrides } from '../../shared/source-control-ai-types'
import type { ResolvedSourceControlAiGenerationParams } from '../../shared/source-control-ai'
import type { TuiAgent } from '../../shared/tui-agent'
import type { AgentLaunchProfile } from '../../shared/agent-launch-profiles'
import {
  buildAgentLaunchProfileEnv,
  getAgentLaunchProfiles,
  isProfileAgent,
  type ProfileAgent
} from '../../shared/agent-launch-profile-agents'
import {
  prepareLocalCommitMessageAgentEnv,
  type CommitMessageAgentEnvironmentResolvers,
  type CommitMessageAgentRuntimeTarget
} from './commit-message-agent-environment'

type ProfileSettings = Partial<Pick<GlobalSettings, 'claudeLaunchProfiles' | 'piLaunchProfiles'>>

const PROFILE_AGENTS: ProfileAgent[] = ['claude', 'pi']

type SourceControlGenerationEnvironment =
  | { ok: true; params: ResolvedSourceControlAiGenerationParams; env?: NodeJS.ProcessEnv }
  | { ok: false; error: string }

/** A repository's text-generation account: its profile for the generating agent, or none. */
function findRepositoryLaunchProfile(
  settings: ProfileSettings,
  repoAi: RepoSourceControlAiOverrides | undefined,
  agentId: TuiAgent | 'custom'
): { ok: true; profile?: AgentLaunchProfile; agent?: ProfileAgent } | { ok: false; error: string } {
  const profileId = repoAi?.launchProfileId
  if (!profileId) {
    return { ok: true }
  }
  if (agentId !== 'custom' && isProfileAgent(agentId)) {
    const profile = getAgentLaunchProfiles(settings, agentId).find(
      (candidate) => candidate.id === profileId
    )
    if (profile) {
      return { ok: true, profile, agent: agentId }
    }
  }
  const anyAgentOwnsProfile = PROFILE_AGENTS.some((agent) =>
    getAgentLaunchProfiles(settings, agent).some((candidate) => candidate.id === profileId)
  )
  // A profile of another agent leaves this agent on its built-in account; a deleted one never does.
  return anyAgentOwnsProfile
    ? { ok: true }
    : {
        ok: false,
        error:
          "This repository's text generation account no longer exists. Choose another in its Source Control AI settings."
      }
}

/** Account environment for repository text generation, honouring the repository's launch profile. */
export async function prepareSourceControlGenerationEnvironment(args: {
  params: ResolvedSourceControlAiGenerationParams
  repoAi: RepoSourceControlAiOverrides | undefined
  settings: ProfileSettings
  resolvers: CommitMessageAgentEnvironmentResolvers | undefined
  target?: CommitMessageAgentRuntimeTarget
}): Promise<SourceControlGenerationEnvironment> {
  const { params, resolvers, target } = args
  const selection = findRepositoryLaunchProfile(args.settings, args.repoAi, params.agentId)
  if (!selection.ok) {
    return selection
  }
  const { profile, agent } = selection
  if (!profile || !agent) {
    const localEnv = await prepareLocalCommitMessageAgentEnv(params.agentId, resolvers, target)
    return localEnv.ok
      ? { ok: true, params, ...(localEnv.env ? { env: localEnv.env } : {}) }
      : localEnv
  }
  if (target?.runtime === 'wsl') {
    return {
      ok: false,
      error: `Launch profile ${profile.name} runs only in workspaces on this computer, not in WSL.`
    }
  }
  // The profile pins its own account root, so managed-account routing is skipped as for terminals.
  const baseEnv = await prepareLocalCommitMessageAgentEnv(
    params.agentId,
    resolvers?.resolveBaseEnvironment
      ? { resolveBaseEnvironment: resolvers.resolveBaseEnvironment }
      : undefined,
    target
  )
  if (!baseEnv.ok) {
    return baseEnv
  }
  return {
    ok: true,
    params: { ...params, agentCommandOverride: profile.command },
    env: { ...(baseEnv.env ?? process.env), ...buildAgentLaunchProfileEnv(agent, profile) }
  }
}
