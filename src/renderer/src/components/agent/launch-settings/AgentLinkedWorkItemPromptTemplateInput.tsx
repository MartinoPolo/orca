import { useRef, useState } from 'react'
import { Button } from '../../ui/button'
import { Textarea } from '../../ui/textarea'
import { useTranslate } from '@/i18n/use-translate'
import { ARTIFACT_URL_TEMPLATE_TOKEN } from '../../../../../shared/agent-linked-work-item-prompt-templates'

export function AgentLinkedWorkItemPromptTemplateInput({
  template,
  onSave
}: {
  template: string | undefined
  onSave: (value: string) => void | Promise<void>
}): React.JSX.Element {
  const t = useTranslate()
  const draftSeed = template ?? ''
  const [draft, setDraft] = useState(draftSeed)
  const suppressNextBlurCommit = useRef(false)
  const commit = (): void => {
    const trimmed = draft.trim()
    onSave(trimmed)
    setDraft(trimmed)
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">
        {t(
          'auto.components.settings.AgentsPane.linkedWorkItemPromptTemplate',
          'Linked work-item prompt template'
        )}
      </span>
      <div className="flex items-start gap-2">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (suppressNextBlurCommit.current) {
              suppressNextBlurCommit.current = false
              return
            }
            commit()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              suppressNextBlurCommit.current = true
              setDraft(draftSeed)
              event.currentTarget.blur()
            }
          }}
          aria-label={t(
            'auto.components.settings.AgentsPane.linkedWorkItemPromptTemplate',
            'Linked work-item prompt template'
          )}
          placeholder={`/skill:mpx-execute ${ARTIFACT_URL_TEMPLATE_TOKEN}`}
          rows={2}
          spellCheck={false}
          className="min-h-14 flex-1 resize-y"
        />
        {template && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              onSave('')
              setDraft('')
            }}
            className="h-7 shrink-0 text-xs text-muted-foreground hover:text-foreground"
          >
            {t('auto.components.settings.AgentsPane.5200dac9da', 'Reset')}
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t(
          'auto.components.settings.AgentsPane.linkedWorkItemPromptTemplateDescription',
          'Use {{artifact_url}} for the linked URL. A template without it is used literally. Leave blank to restore the default linked work-item draft.',
          { artifact_url: ARTIFACT_URL_TEMPLATE_TOKEN }
        )}
      </p>
    </div>
  )
}
