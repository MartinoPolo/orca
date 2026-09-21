import { describe, expect, it } from 'vitest'
import { withAgentLinkedWorkItemPromptTemplate } from './agent-linked-work-item-prompt-templates'

describe('withAgentLinkedWorkItemPromptTemplate', () => {
  it('saves and resets one agent prompt template without changing other agents', () => {
    const templates = {
      codex: 'Review {{artifact_url}}',
      claude: 'Fix {{artifact_url}}'
    }

    expect(
      withAgentLinkedWorkItemPromptTemplate(templates, 'pi', '/skill:mpx-execute {{artifact_url}}')
    ).toEqual({ ...templates, pi: '/skill:mpx-execute {{artifact_url}}' })
    expect(withAgentLinkedWorkItemPromptTemplate(templates, 'codex', '')).toEqual({
      claude: 'Fix {{artifact_url}}'
    })
  })
})
