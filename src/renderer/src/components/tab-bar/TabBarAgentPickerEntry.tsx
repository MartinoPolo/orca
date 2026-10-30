import {
  useAgentPickerInventoryEntries,
  type AgentPickerInventorySource
} from '../agent/use-agent-launch-picker-inventory'
import { useTabAgentLaunchOptions } from './use-tab-agent-launch-options'
import TabBarCreateEntry from './TabBarCreateEntry'
import type { TabBarCreateEntryProps } from './tab-create-entry-props'

// Subscribe inside the menu so inventory updates do not re-render the tab bar.
export function TabBarAgentPickerEntry({
  inventory,
  ...props
}: Omit<TabBarCreateEntryProps, 'agentPickerEntries' | 'agentOptions'> & {
  inventory: AgentPickerInventorySource
}): React.JSX.Element {
  const entries = useAgentPickerInventoryEntries(inventory)
  const launchOptions = useTabAgentLaunchOptions(props.worktreeId, entries)
  return <TabBarCreateEntry {...props} agentPickerEntries={entries} agentOptions={launchOptions} />
}
