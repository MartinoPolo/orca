import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import {
  getAgentLaunchProfiles,
  isProfileAgent
} from '../../../../shared/agent-launch-profile-agents'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { AUTOMATION_EDITOR_SECTION_LABEL_CLASS, Field } from './automation-page-parts'
import type { AutomationDraft } from './AutomationEditorDialog'

// Radix Select reserves the empty string, so the configured command needs a sentinel.
const CONFIGURED_COMMAND_VALUE = '__configured-command__'

/** The launch profile (account) a run uses; shown only for agents with configured profiles. */
export function AutomationAgentProfileField({
  draft,
  settings,
  onDraftChange
}: {
  draft: AutomationDraft
  settings: GlobalSettings | null
  onDraftChange: (updater: (current: AutomationDraft) => AutomationDraft) => void
}): React.JSX.Element | null {
  const profiles = isProfileAgent(draft.agentId)
    ? getAgentLaunchProfiles(settings, draft.agentId)
    : []
  const choices = profiles.map((profile) => ({ value: profile.id, label: profile.name }))
  if (draft.agentProfileId && !profiles.some((profile) => profile.id === draft.agentProfileId)) {
    choices.push({
      value: draft.agentProfileId,
      label: translate('automations.agentProfile.missingProfile', 'Deleted profile')
    })
  }
  if (choices.length === 0) {
    return null
  }
  return (
    <Field
      labelClassName={AUTOMATION_EDITOR_SECTION_LABEL_CLASS}
      label={translate('automations.agentProfile.label', 'Account')}
    >
      <Select
        value={draft.agentProfileId ?? CONFIGURED_COMMAND_VALUE}
        onValueChange={(value) =>
          onDraftChange((current) => ({
            ...current,
            agentProfileId: value === CONFIGURED_COMMAND_VALUE ? undefined : value
          }))
        }
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" side="bottom" align="start" sideOffset={4}>
          <SelectItem value={CONFIGURED_COMMAND_VALUE}>
            {translate('automations.agentProfile.configuredCommand', 'Default command')}
          </SelectItem>
          {choices.map((choice) => (
            <SelectItem key={choice.value} value={choice.value}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}
