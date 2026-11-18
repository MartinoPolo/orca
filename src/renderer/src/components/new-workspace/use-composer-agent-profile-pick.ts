import { useCallback, useState } from 'react'
import type { AgentProfileSelection } from '../../../../shared/agent-launch-profile-agents'

/** The picked launch profile, while the composer's current target still offers it. */
export function useComposerAgentProfilePick(options: readonly AgentProfileSelection[]): {
  activeProfile: AgentProfileSelection | null
  setPickedProfile: (selection: AgentProfileSelection | null) => void
} {
  const [pickedProfile, setPickedProfile] = useState<AgentProfileSelection | null>(null)
  // A deleted profile, or a host without it, falls back to the plain agent pick.
  const activeProfile = pickedProfile
    ? (options.find(
        (option) =>
          option.agent === pickedProfile.agent && option.profile.id === pickedProfile.profile.id
      ) ?? null)
    : null
  return { activeProfile, setPickedProfile }
}

/** Picker props for the offered profiles (absent when none); picking one also selects its agent's terminal. */
export function useComposerAgentProfilePicker(
  options: readonly AgentProfileSelection[],
  selected: AgentProfileSelection | null,
  setPickedProfile: (selection: AgentProfileSelection | null) => void,
  selectAgentTerminal: (agent: AgentProfileSelection['agent'], surface: 'terminal') => void
):
  | {
      options: readonly AgentProfileSelection[]
      selected: AgentProfileSelection | null
      onSelect: (selection: AgentProfileSelection) => void
    }
  | undefined {
  const onSelect = useCallback(
    (selection: AgentProfileSelection) => {
      selectAgentTerminal(selection.agent, 'terminal')
      setPickedProfile(selection)
    },
    [selectAgentTerminal, setPickedProfile]
  )
  return options.length > 0 ? { options, selected, onSelect } : undefined
}
