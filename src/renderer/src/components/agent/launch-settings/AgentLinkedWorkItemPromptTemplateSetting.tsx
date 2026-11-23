import { AgentLinkedWorkItemPromptTemplateInput } from './AgentLinkedWorkItemPromptTemplateInput'

/** Renders only where this client owns the template (local settings), signalled by `onSave`. */
export function AgentLinkedWorkItemPromptTemplateSetting({
  agentId,
  template,
  onSave
}: {
  agentId: string
  template: string | undefined
  onSave: ((value: string) => void | Promise<void>) | undefined
}): React.JSX.Element | null {
  if (!onSave) {
    return null
  }
  return (
    <div className="mt-2">
      <AgentLinkedWorkItemPromptTemplateInput
        key={`${agentId}:${template ?? ''}`}
        template={template}
        onSave={onSave}
      />
    </div>
  )
}
