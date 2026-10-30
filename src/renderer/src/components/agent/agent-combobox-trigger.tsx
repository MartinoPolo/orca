import React from 'react'
import { Terminal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AgentIcon, type AgentCatalogEntry } from '@/lib/agent-catalog'
import { translate } from '@/i18n/i18n'
import { rowLabel } from '@/components/tab-bar/tab-agent-row-presentation'
import type { AgentProfileSelection } from '../../../../shared/agent-launch-profile-agents'
import { AgentIconLabel } from './agent-combobox-items'

function selectAgentText(): string {
  return translate('components.agentSessionContinuation.selectAgent', 'Select an Agent')
}

export function AgentComboboxTriggerLabel({
  selectionCleared,
  selectedProfile,
  selectedAgent,
  picksCli,
  blankText
}: {
  selectionCleared: boolean
  selectedProfile: AgentProfileSelection | null
  selectedAgent: AgentCatalogEntry | null
  picksCli: boolean
  /** Null when Blank Terminal is not offered. */
  blankText: string | null
}): React.JSX.Element {
  if (selectionCleared) {
    return <span className="truncate text-muted-foreground">{selectAgentText()}</span>
  }
  if (selectedProfile) {
    return (
      <AgentIconLabel
        icon={<AgentIcon agent={selectedProfile.agent} size={14} />}
        label={selectedProfile.profile.name}
      />
    )
  }
  if (selectedAgent) {
    return (
      <AgentIconLabel
        icon={<AgentIcon agent={selectedAgent.id} size={14} />}
        label={picksCli ? rowLabel({ kind: 'cli', agent: selectedAgent.id }) : selectedAgent.label}
      />
    )
  }
  return (
    <AgentIconLabel
      icon={<Terminal className="size-3.5" />}
      label={blankText ?? selectAgentText()}
    />
  )
}

export function AgentComboboxClearButton({
  disabled,
  onClear
}: {
  disabled?: boolean
  onClear: () => void
}): React.JSX.Element {
  const label = translate('components.agentCombobox.clearSelection', 'Clear agent selection')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={disabled}
          className="absolute right-8 top-1/2 -translate-y-1/2"
          aria-label={label}
          onClick={onClear}
        >
          <X />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
