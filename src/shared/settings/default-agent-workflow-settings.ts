import type { GlobalSettings } from './global-settings-types'
import { FILE_LINK_SYSTEM_APP_KINDS } from '../file-link-system-app-kinds'

type AgentWorkflowSettings = Pick<
  GlobalSettings,
  | 'fileLinkSystemAppKinds'
  | 'prioritizeWorkProjects'
  | 'workProjectsFolder'
  | 'piLaunchProfiles'
  | 'claudeLaunchProfiles'
  | 'agentLinkedWorkItemPromptTemplates'
>

/** Lets default-global-settings take its settings type and these defaults from one import. */
export type { GlobalSettings }

/** Adds the defaults for launch profiles, linked work-item prompts, work-project priority, and terminal file-link opening. */
export function withAgentWorkflowDefaults(
  settings: Omit<GlobalSettings, keyof AgentWorkflowSettings>
): GlobalSettings {
  return {
    fileLinkSystemAppKinds: [...FILE_LINK_SYSTEM_APP_KINDS],
    prioritizeWorkProjects: true,
    workProjectsFolder: '',
    piLaunchProfiles: [],
    claudeLaunchProfiles: [],
    agentLinkedWorkItemPromptTemplates: {},
    ...settings
  }
}
