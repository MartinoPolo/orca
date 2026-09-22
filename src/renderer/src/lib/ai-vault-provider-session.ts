import type { AiVaultSession } from '../../../shared/ai-vault-types'
import {
  isResumableTuiAgent,
  type AgentProviderSessionMetadata
} from '../../../shared/agent-session-resume'

export function getAiVaultAgentProviderSession(
  session: Pick<AiVaultSession, 'agent' | 'sessionId'> & { filePath?: string }
): AgentProviderSessionMetadata | null {
  if (!isResumableTuiAgent(session.agent)) {
    return null
  }
  if (session.agent === 'antigravity') {
    return { key: 'conversation_id', id: session.sessionId }
  }
  if (session.agent === 'pi' || session.agent === 'prime-agent') {
    return session.filePath
      ? { key: 'session_id', id: session.sessionId, transcriptPath: session.filePath }
      : null
  }
  return { key: 'session_id', id: session.sessionId }
}
