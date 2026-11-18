import type { TuiAgent } from '../../../../../../shared/agent-launch/catalog/tui-agent'
import { withAgentLinkedWorkItemPromptTemplate } from '../../../../../../shared/agent-linked-work-item-prompt-templates'
import type { GlobalSettings } from '../../../../../../shared/settings/global-settings-types'

type LocalAgentSettings = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
}

export function linkedWorkItemPromptTemplateRowProps(local: LocalAgentSettings, agent: TuiAgent) {
  return {
    linkedWorkItemPromptTemplate: local.settings.agentLinkedWorkItemPromptTemplates?.[agent],
    onSaveLinkedWorkItemPromptTemplate: (value: string) =>
      local.updateSettings({
        agentLinkedWorkItemPromptTemplates: withAgentLinkedWorkItemPromptTemplate(
          local.settings.agentLinkedWorkItemPromptTemplates,
          agent,
          value
        )
      })
  }
}
