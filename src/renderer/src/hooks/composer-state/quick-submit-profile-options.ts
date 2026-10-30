import type { AgentProfileHostScope } from '../../../../shared/agent-launch-profiles'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { getValidatedComposerAgentProfile } from '@/lib/composer-agent-profile-target'
import type { QuickSubmitOptions } from './quick-creation-request'

/** Validates a picked profile against current settings; throws when it can no longer launch. */
export function resolveQuickSubmitProfileOptions(
  options: QuickSubmitOptions | undefined,
  settings: Pick<GlobalSettings, 'piLaunchProfiles' | 'claudeLaunchProfiles'> | null,
  scope: AgentProfileHostScope | null
): QuickSubmitOptions | undefined {
  const agentProfile = getValidatedComposerAgentProfile(options?.agentProfile, settings, scope)
  if (!agentProfile) {
    return options
  }
  // A profile starts its own command in a terminal, never a structured chat.
  return {
    ...options,
    agentProfile,
    launchChoice: {
      ...options?.launchChoice,
      agent: agentProfile.agent,
      route: 'terminal-tui',
      requestedSurface: 'terminal'
    }
  }
}
