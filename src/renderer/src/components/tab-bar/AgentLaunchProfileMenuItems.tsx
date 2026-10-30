import React from 'react'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { AgentIcon } from '@/lib/agent-catalog'
import { useAgentLaunchProfilesForWorktree } from '@/hooks/useAgentLaunchProfilesForWorktree'
import type { NewTabAgentMenuRow } from '@/lib/new-tab-agent-menu-rows'
import type { AgentLaunchProfile } from '../../../../shared/agent-launch-profiles'
import { PROFILE_AGENTS } from '../../../../shared/agent-launch-profile-agents'
import type { AgentPickerDraft, AgentPickerEntry } from '../../../../shared/agent-launch-picker'
import { rowTitle } from './tab-agent-row-presentation'

/** One terminal launch per named account profile that this workspace's host can run. */
export function AgentLaunchProfileMenuItems({
  worktreeId,
  disabled = false,
  runLaunch
}: {
  worktreeId: string
  disabled?: boolean
  runLaunch: (
    row: NewTabAgentMenuRow,
    draft: AgentPickerDraft | undefined,
    pickerEntry: AgentPickerEntry | undefined,
    agentLaunchProfile: AgentLaunchProfile
  ) => void
}): React.JSX.Element | null {
  const profilesByAgent = useAgentLaunchProfilesForWorktree(worktreeId)
  const options = PROFILE_AGENTS.flatMap((agent) =>
    (profilesByAgent[agent] ?? []).map((profile) => ({ agent, profile }))
  )
  if (options.length === 0) {
    return null
  }
  return (
    <>
      <DropdownMenuSeparator />
      {options.map(({ agent, profile }) => {
        const row: NewTabAgentMenuRow = { kind: 'terminal', agent }
        return (
          <DropdownMenuItem
            key={`${agent}-profile:${profile.id}`}
            variant="launch"
            disabled={disabled}
            onSelect={() => runLaunch(row, undefined, undefined, profile)}
            title={rowTitle(row, profile.name)}
          >
            <AgentIcon agent={agent} size={14} />
            <span className="flex-1">{profile.name}</span>
          </DropdownMenuItem>
        )
      })}
    </>
  )
}
