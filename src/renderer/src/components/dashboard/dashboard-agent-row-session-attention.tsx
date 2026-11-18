import React, { useRef } from 'react'
import type { AgentDotState } from '@/components/agent/status/AgentStateDot'
import { useAgentRowSessionAttention } from '@/attention/use-agent-row-session-attention'
import {
  sessionAttentionMetadataClass,
  sessionAttentionSurfaceClass
} from '@/attention/session-attention-components'
import {
  activateAgentRowFromKeyboard,
  AgentRowSessionAttentionMenu,
  AgentRowSessionMarkers
} from '@/attention/agent-row-session-attention'
import type { DashboardAgentRow } from './rows/dashboard-agent-row'

/** Binds a dashboard agent row to its session's attention styling, markers, and context menu. */
export function useDashboardAgentRowSessionAttention(
  agent: DashboardAgentRow,
  dotState: AgentDotState,
  isUnvisited: boolean,
  sessionName: string
) {
  const attention = useAgentRowSessionAttention(agent, dotState, isUnvisited)
  const rowRef = useRef<HTMLDivElement | null>(null)
  return {
    metadataClass: sessionAttentionMetadataClass(attention.tone),
    surfaceClass: sessionAttentionSurfaceClass(attention.tone, attention.unread),
    rowProps: {
      ref: rowRef,
      tabIndex: attention.isSession ? 0 : undefined,
      onKeyDown: activateAgentRowFromKeyboard
    },
    markers: (
      <AgentRowSessionMarkers
        paneKey={agent.paneKey}
        sessionName={sessionName}
        attention={attention}
      />
    ),
    withMenu: (row: React.ReactElement) => (
      <AgentRowSessionAttentionMenu
        paneKey={agent.paneKey}
        sessionName={sessionName}
        attention={attention}
        triggerRef={rowRef}
      >
        {row}
      </AgentRowSessionAttentionMenu>
    )
  }
}
