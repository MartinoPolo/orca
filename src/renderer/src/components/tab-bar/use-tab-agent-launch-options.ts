import type { AgentPickerEntry } from '../../../../shared/agent-launch-picker'
import { useAgentLaunchProfilesForWorktree } from '@/hooks/useAgentLaunchProfilesForWorktree'
import { useAppStore } from '../../store'
import {
  buildAgentLaunchProfileOptions,
  buildAgentPickerLaunchOptions,
  type TabAgentLaunchOption
} from './tab-agent-launch-options'

/** Searchable new-tab agent launches: picker agents first, then this host's named profiles. */
export function useTabAgentLaunchOptions(
  worktreeId: string,
  agentPickerEntries: AgentPickerEntry[]
): TabAgentLaunchOption[] {
  const commandOverrides = useAppStore((state) => state.settings?.agentCmdOverrides)
  const agentLaunchProfiles = useAgentLaunchProfilesForWorktree(worktreeId)
  return [
    ...buildAgentPickerLaunchOptions(agentPickerEntries, commandOverrides),
    ...buildAgentLaunchProfileOptions(agentLaunchProfiles)
  ]
}
