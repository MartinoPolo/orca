import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useTranslate } from '@/i18n/use-translate'
import {
  getAgentLaunchProfiles,
  isProfileAgent
} from '../../../../../shared/agent-launch-profile-agents'
import type { GlobalSettings } from '../../../../../shared/settings/global-settings-types'
import { AUTOMATION_EDITOR_SECTION_LABEL_CLASS, Field } from '../automation-page-parts'
import type { AutomationDraft } from './AutomationEditorDialog'

// Radix Select reserves the empty string, so the built-in account needs a sentinel.
const DEFAULT_ACCOUNT_VALUE = '__default-account__'

/** The launch profile (account) a run uses; shown only for agents with configured profiles. */
export function AutomationAgentProfileField({
  draft,
  settings,
  surface,
  onDraftChange
}: {
  draft: AutomationDraft
  settings: GlobalSettings | null
  surface: 'chat' | 'terminal'
  onDraftChange: (updater: (current: AutomationDraft) => AutomationDraft) => void
}): React.JSX.Element | null {
  const t = useTranslate()
  const profiles = isProfileAgent(draft.agentId)
    ? getAgentLaunchProfiles(settings, draft.agentId)
    : []
  const choices = profiles.map((profile) => ({ value: profile.id, label: profile.name }))
  // A deleted profile stays selected so the automation never silently moves to another account.
  if (draft.agentProfileId && !profiles.some((profile) => profile.id === draft.agentProfileId)) {
    choices.push({
      value: draft.agentProfileId,
      label: t('automations.agentProfile.missingProfile', 'Deleted profile')
    })
  }
  if (choices.length === 0) {
    return null
  }
  return (
    <Field
      labelClassName={AUTOMATION_EDITOR_SECTION_LABEL_CLASS}
      label={t('automations.agentProfile.label', 'Account')}
    >
      <Select
        value={draft.agentProfileId ?? DEFAULT_ACCOUNT_VALUE}
        onValueChange={(value) =>
          onDraftChange((current) => ({
            ...current,
            agentProfileId: value === DEFAULT_ACCOUNT_VALUE ? undefined : value
          }))
        }
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" side="bottom" align="start" sideOffset={4}>
          <SelectItem value={DEFAULT_ACCOUNT_VALUE}>
            {t('automations.agentProfile.defaultAccount', 'Default account')}
          </SelectItem>
          {choices.map((choice) => (
            <SelectItem key={choice.value} value={choice.value}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {draft.agentProfileId && surface === 'chat' ? (
        <p className="text-xs text-destructive">
          {t(
            'automations.agentProfile.chatUnsupported',
            'Launch profiles run only in a terminal. Switch to Terminal or use the default account.'
          )}
        </p>
      ) : null}
    </Field>
  )
}
