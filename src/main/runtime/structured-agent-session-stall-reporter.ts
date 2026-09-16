import type { StructuredAgentSessionTaskStall } from '../native-chat/agent-session-wire/structured-agent-session-task-queue'

export type StructuredAgentSessionErrorReporter = (input: { scope: string; error: unknown }) => void

export function reportStructuredAgentSessionTaskStall(
  { sessionId, ageMs }: StructuredAgentSessionTaskStall,
  reportError?: StructuredAgentSessionErrorReporter
): void {
  const scope = `structured-agent-session-queue:${sessionId}`
  const error = new Error(
    `agent session task has not settled after ${ageMs}ms; later mutations for this session are queued behind it`
  )
  if (reportError) {
    reportError({ scope, error })
  } else {
    console.error(`[${scope}]`, error)
  }
}
