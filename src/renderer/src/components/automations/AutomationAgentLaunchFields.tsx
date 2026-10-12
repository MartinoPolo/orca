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
import {
  findCatalogModel,
  findCatalogOption,
  getAgentSessionOptionCatalog
} from '../../../../shared/agent-session-option-catalog'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { AUTOMATION_EDITOR_SECTION_LABEL_CLASS, Field } from './automation-page-parts'
import type { AutomationDraft } from './AutomationEditorDialog'

// Why: Radix Select reserves the empty string, so "use the agent's own default" needs a sentinel.
const AGENT_DEFAULT_VALUE = '__agent-default__'

type AutomationAgentLaunchFieldsProps = {
  draft: AutomationDraft
  settings: GlobalSettings | null
  onDraftChange: (updater: (current: AutomationDraft) => AutomationDraft) => void
}

type LaunchChoice = { value: string; label: string }

function toDraftValue(value: string): string | undefined {
  return value === AGENT_DEFAULT_VALUE ? undefined : value
}

/** Account, model and effort a run launches with; each field appears only when the agent supports it. */
export function AutomationAgentLaunchFields({
  draft,
  settings,
  onDraftChange
}: AutomationAgentLaunchFieldsProps): React.JSX.Element | null {
  const profiles = isProfileAgent(draft.agentId)
    ? getAgentLaunchProfiles(settings, draft.agentId)
    : []
  const accountChoices: LaunchChoice[] = profiles.map((profile) => ({
    value: profile.id,
    label: profile.name
  }))
  if (draft.agentProfileId && !profiles.some((profile) => profile.id === draft.agentProfileId)) {
    accountChoices.push({
      value: draft.agentProfileId,
      label: translate('automations.agentLaunch.missingProfile', 'Deleted profile')
    })
  }

  const catalog = getAgentSessionOptionCatalog(draft.agentId)
  const modelId = draft.launchPreferences?.model
  const modelChoices: LaunchChoice[] = catalog?.modelApply.launchArgs
    ? catalog.models.map((model) => ({ value: model.id, label: model.label }))
    : []
  if (modelId && !modelChoices.some((choice) => choice.value === modelId)) {
    modelChoices.push({ value: modelId, label: modelId })
  }
  const catalogModel = catalog && modelId ? findCatalogModel(catalog, modelId) : undefined
  const effortOption =
    findCatalogOption(catalogModel, 'effort') ??
    (modelId && !catalogModel
      ? catalog?.unknownModelOptions?.find((option) => option.id === 'effort')
      : undefined)
  const effortChoices: LaunchChoice[] =
    effortOption?.kind.type === 'select' ? effortOption.kind.choices : []

  if (accountChoices.length === 0 && modelChoices.length === 0) {
    return null
  }

  const setProfile = (value: string): void =>
    onDraftChange((current) => ({ ...current, agentProfileId: toDraftValue(value) }))
  const setModel = (value: string): void =>
    onDraftChange((current) => {
      const model = toDraftValue(value)
      // Why: effort menus are per model, so a model change restarts from the model's default.
      return { ...current, launchPreferences: model ? { model } : undefined }
    })
  const setEffort = (value: string): void =>
    onDraftChange((current) => {
      const model = current.launchPreferences?.model
      const effort = toDraftValue(value)
      return model
        ? { ...current, launchPreferences: { model, ...(effort ? { effort } : {}) } }
        : current
    })

  return (
    <>
      {accountChoices.length > 0 ? (
        <LaunchChoiceField
          label={translate('automations.agentLaunch.account', 'Account')}
          defaultLabel={translate('automations.agentLaunch.defaultAccount', 'Default command')}
          value={draft.agentProfileId}
          choices={accountChoices}
          onValueChange={setProfile}
        />
      ) : null}
      {modelChoices.length > 0 ? (
        <LaunchChoiceField
          label={translate('automations.agentLaunch.model', 'Model')}
          defaultLabel={translate('automations.agentLaunch.agentDefault', 'Agent default')}
          value={modelId}
          choices={modelChoices}
          onValueChange={setModel}
        />
      ) : null}
      {effortChoices.length > 0 ? (
        <LaunchChoiceField
          label={translate('automations.agentLaunch.effort', 'Effort')}
          defaultLabel={translate('automations.agentLaunch.agentDefault', 'Agent default')}
          value={draft.launchPreferences?.effort}
          choices={effortChoices}
          onValueChange={setEffort}
        />
      ) : null}
    </>
  )
}

function LaunchChoiceField({
  label,
  defaultLabel,
  value,
  choices,
  onValueChange
}: {
  label: string
  defaultLabel: string
  value: string | undefined
  choices: readonly LaunchChoice[]
  onValueChange: (value: string) => void
}): React.JSX.Element {
  return (
    <Field labelClassName={AUTOMATION_EDITOR_SECTION_LABEL_CLASS} label={label}>
      <Select value={value ?? AGENT_DEFAULT_VALUE} onValueChange={onValueChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" side="bottom" align="start" sideOffset={4}>
          <SelectItem value={AGENT_DEFAULT_VALUE}>{defaultLabel}</SelectItem>
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
