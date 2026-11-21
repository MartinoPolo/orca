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

/** Defaults for launch profiles, linked work-item prompts, work-project priority, and terminal file-link opening. */
export function buildDefaultAgentWorkflowSettings(): AgentWorkflowSettings {
  return {
    fileLinkSystemAppKinds: [...FILE_LINK_SYSTEM_APP_KINDS],
    prioritizeWorkProjects: true,
    workProjectsFolder: '',
    piLaunchProfiles: [],
    claudeLaunchProfiles: [],
    agentLinkedWorkItemPromptTemplates: {}
  }
}
