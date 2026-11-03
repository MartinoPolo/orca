import type React from 'react'
import type { GlobalSettings } from '../../../../../../shared/global-settings-types'
import {
  AGENT_LAUNCH_PROFILE_AGENTS,
  getAgentLaunchProfiles,
  type ProfileAgent
} from '../../../../../../shared/agent-launch-profile-agents'
import { Label } from '../../../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../ui/select'
import { translate } from '@/i18n/i18n'

const DEFAULT_ACCOUNT = 'default'
const PROFILE_AGENTS: ProfileAgent[] = ['claude', 'pi']

type RepositorySourceControlAiLaunchProfileProps = {
  value: string | undefined
  settings: Pick<GlobalSettings, 'claudeLaunchProfiles' | 'piLaunchProfiles'> | null | undefined
  onChange: (value: string | undefined) => void
}

export function RepositorySourceControlAiLaunchProfile({
  value,
  settings,
  onChange
}: RepositorySourceControlAiLaunchProfileProps): React.JSX.Element | null {
  const options = PROFILE_AGENTS.flatMap((agent) =>
    getAgentLaunchProfiles(settings ?? {}, agent).map((profile) => ({
      id: profile.id,
      label: translate(
        'settings.agentLaunchProfiles.sourceControlAccountOption',
        '{{profileName}} ({{agentName}})',
        { profileName: profile.name, agentName: AGENT_LAUNCH_PROFILE_AGENTS[agent].label }
      )
    }))
  )
  // A deleted profile stays selected so the repository never silently moves to another account.
  if (options.length === 0 && value === undefined) {
    return null
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-0.5">
        <Label>
          {translate(
            'settings.agentLaunchProfiles.sourceControlAccountLabel',
            'Text generation account'
          )}
        </Label>
        <p className="text-[11px] text-muted-foreground">
          {translate(
            'settings.agentLaunchProfiles.sourceControlAccountHelper',
            'Commit messages and pull request details in this repository run under this profile when they use its agent. Applies on this computer only.'
          )}
        </p>
      </div>
      <Select
        value={value ?? DEFAULT_ACCOUNT}
        onValueChange={(nextValue) => {
          onChange(nextValue === DEFAULT_ACCOUNT ? undefined : nextValue)
        }}
      >
        <SelectTrigger size="sm" className="h-8 w-full sm:w-[150px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_ACCOUNT}>
            {translate(
              'settings.agentLaunchProfiles.sourceControlAccountDefault',
              'Default account'
            )}
          </SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
          {value !== undefined && !options.some((option) => option.id === value) ? (
            <SelectItem value={value}>{value}</SelectItem>
          ) : null}
        </SelectContent>
      </Select>
    </div>
  )
}
