import type { AgentLaunchProfile } from './agent-launch-profiles'
import type { TuiAgent } from './tui-agent'

/** Global settings for named agent accounts and linked work-item launch drafts. */
export type AgentLaunchSettings = {
  /** Pi account launchers. Account directories are explicit so resumes never reinterpret an id. */
  piLaunchProfiles?: AgentLaunchProfile[]
  /** Claude account launchers; a transcript under a profile root resumes with that profile. */
  claudeLaunchProfiles?: AgentLaunchProfile[]
  /** Per-agent draft template used when launching with a linked work-item URL. */
  agentLinkedWorkItemPromptTemplates?: Partial<Record<TuiAgent, string>>
}
