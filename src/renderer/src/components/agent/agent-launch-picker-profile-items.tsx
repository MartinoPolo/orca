import React from 'react'
import { DropdownMenuCheckboxItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { AgentIcon } from '@/components/agent/icons/AgentIcon'
import type { AgentProfileSelection } from '../../../../shared/agent-launch-profile-agents'

/** Named launch profiles offered by a picker; a pick launches the profile's command and account. */
export type AgentLaunchPickerProfiles = {
  options: readonly AgentProfileSelection[]
  selected: AgentProfileSelection | null
  onSelect: (selection: AgentProfileSelection) => void
}

function isSameProfile(left: AgentProfileSelection | null, right: AgentProfileSelection): boolean {
  return left?.agent === right.agent && left.profile.id === right.profile.id
}

export function AgentLaunchPickerProfileItems({
  profiles
}: {
  profiles: AgentLaunchPickerProfiles | undefined
}): React.JSX.Element | null {
  if (!profiles || profiles.options.length === 0) {
    return null
  }
  return (
    <>
      {profiles.options.map((selection) => (
        <DropdownMenuCheckboxItem
          key={`${selection.agent}-profile:${selection.profile.id}`}
          checked={isSameProfile(profiles.selected, selection)}
          title={selection.profile.command}
          onSelect={() => profiles.onSelect(selection)}
        >
          <AgentIcon agent={selection.agent} size={14} />
          <span className="min-w-0 flex-1 truncate">{selection.profile.name}</span>
        </DropdownMenuCheckboxItem>
      ))}
      <DropdownMenuSeparator />
    </>
  )
}
