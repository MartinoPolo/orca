import type { AgentDetectionTarget } from '@/lib/agent-session/launch/inventory/useDetectedAgents'
import type { RuntimeClientTarget } from '../../../../../../shared/remote-runtime/host-catalog/runtime-client-target'

/** The model catalog a launch choice reads; SSH hosts have no runtime catalog. */
export function agentChoiceCatalogTarget(
  detectionTarget: AgentDetectionTarget
): RuntimeClientTarget | null {
  if (detectionTarget.kind === 'ssh') {
    return null
  }
  return detectionTarget.kind === 'runtime'
    ? { kind: 'environment', environmentId: detectionTarget.environmentId }
    : { kind: 'local' }
}
