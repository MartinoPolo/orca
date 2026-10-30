import React from 'react'
import { CommandSeparator } from '@/components/ui/command'
import { AgentIcon } from '@/lib/agent-catalog'
import { agentPickerTextMatches } from '@/lib/agent-picker-search'
import type { AgentProfileSelection } from '../../../../shared/agent-launch-profile-agents'
import { renderAgentComboboxItem } from './agent-combobox-items'

/** Named launch profiles listed after the agents; a pick launches the profile's command and account. */
export type AgentComboboxProfiles = {
  options: readonly AgentProfileSelection[]
  selected: AgentProfileSelection | null
  onSelect: (selection: AgentProfileSelection) => void
}

export function profileCommandValue(selection: AgentProfileSelection): string {
  return `${selection.agent}-profile:${selection.profile.id}`
}

export function searchAgentComboboxProfiles(
  profiles: AgentComboboxProfiles | undefined,
  query: string
): readonly AgentProfileSelection[] {
  return (profiles?.options ?? []).filter(({ profile }) =>
    agentPickerTextMatches(query, [profile.name, profile.command])
  )
}

/** The highlighted row: the selected profile until a query runs, then agents before profiles. */
export function profileAwareCommandValue(
  agentCommandValue: string,
  query: string,
  profiles: AgentComboboxProfiles | undefined,
  matches: readonly AgentProfileSelection[]
): string {
  if (!query.trim()) {
    return profiles?.selected ? profileCommandValue(profiles.selected) : agentCommandValue
  }
  return agentCommandValue || (matches[0] ? profileCommandValue(matches[0]) : '')
}

export function AgentProfileItems({
  profiles,
  matches,
  onPicked
}: {
  profiles: AgentComboboxProfiles | undefined
  matches: readonly AgentProfileSelection[]
  onPicked: () => void
}): React.ReactNode {
  if (!profiles || matches.length === 0) {
    return null
  }
  const selectedValue = profiles.selected ? profileCommandValue(profiles.selected) : null
  return (
    <>
      <CommandSeparator />
      {matches.map((selection) => {
        const itemValue = profileCommandValue(selection)
        return renderAgentComboboxItem({
          key: itemValue,
          itemValue,
          isChecked: itemValue === selectedValue,
          isDefault: false,
          onSelect: () => {
            profiles.onSelect(selection)
            onPicked()
          },
          icon: <AgentIcon agent={selection.agent} />,
          label: selection.profile.name,
          title: selection.profile.command
        })
      })}
    </>
  )
}
