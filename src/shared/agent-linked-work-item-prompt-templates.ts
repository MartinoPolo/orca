import type { TuiAgent } from './tui-agent'
import { isTuiAgent } from './tui-agent-config'

export const ARTIFACT_URL_TEMPLATE_TOKEN = '{{artifact_url}}'

export function normalizeAgentLinkedWorkItemPromptTemplates(
  value: unknown
): Partial<Record<TuiAgent, string>> {
  const normalized: Partial<Record<TuiAgent, string>> = {}
  if (!value || typeof value !== 'object') {
    return normalized
  }

  for (const [agent, template] of Object.entries(value)) {
    if (!isTuiAgent(agent) || typeof template !== 'string') {
      continue
    }
    const trimmedTemplate = template.trim()
    if (trimmedTemplate) {
      normalized[agent] = trimmedTemplate
    }
  }
  return normalized
}
