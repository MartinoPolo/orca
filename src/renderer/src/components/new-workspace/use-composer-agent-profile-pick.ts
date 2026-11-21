import { useCallback, useState } from 'react'
import type { AgentProfileSelection } from '../../../../shared/agent-launch-profile-agents'

type ComposerAgentProfilePick = {
  options: readonly AgentProfileSelection[]
  activeProfile: AgentProfileSelection | null
  setPickedProfile: (selection: AgentProfileSelection | null) => void
}

/** The picked launch profile, while the composer's current target still offers it. */
export function useComposerAgentProfilePick(
  options: readonly AgentProfileSelection[]
): ComposerAgentProfilePick {
  const [pickedProfile, setPickedProfile] = useState<AgentProfileSelection | null>(null)
  // A deleted profile, or a host without it, falls back to the plain agent pick.
  const activeProfile = pickedProfile
    ? (options.find(
        (option) =>
          option.agent === pickedProfile.agent && option.profile.id === pickedProfile.profile.id
      ) ?? null)
    : null
  return { options, activeProfile, setPickedProfile }
}

/** Picker props for the offered profiles (absent when none); picking one also selects its agent's terminal. */
export function useComposerAgentProfilePicker(
  { options, activeProfile, setPickedProfile }: ComposerAgentProfilePick,
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
  return options.length > 0 ? { options, selected: activeProfile, onSelect } : undefined
}
