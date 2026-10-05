import { useMemo } from 'react'
import { useAppStore } from '@/store'
import {
  normalizeAgentLaunchProfiles,
  scopeAgentLaunchProfilesToHost
} from '../../../shared/agent-launch-profiles'
import type { AgentLaunchProfilesByAgent } from '@/components/tab-bar/tab-agent-launch-options'
import { resolveAgentProfileHostScope } from '@/lib/agent-profile-launch-target'

const NO_PROFILES: AgentLaunchProfilesByAgent = {}

/** Named profiles a new launch in this workspace may use, with roots resolved on its host. */
export function useAgentLaunchProfilesForWorktree(worktreeId: string): AgentLaunchProfilesByAgent {
  // Why: select primitives so the store subscription stays stable across unrelated updates.
  const scopeKind = useAppStore((state) => {
    const resolution = resolveAgentProfileHostScope(state, worktreeId)
    return resolution.status === 'resolved' ? resolution.scope.kind : null
  })
  const remoteHomeDirectory = useAppStore((state) => {
    const resolution = resolveAgentProfileHostScope(state, worktreeId)
    return resolution.status === 'resolved' && resolution.scope.kind === 'remote'
      ? resolution.scope.homeDirectory
      : null
  })
  const piLaunchProfiles = useAppStore((state) => state.settings?.piLaunchProfiles)
  const claudeLaunchProfiles = useAppStore((state) => state.settings?.claudeLaunchProfiles)

  return useMemo(() => {
    const scope =
      scopeKind === 'local'
        ? ({ kind: 'local', homeDirectory: undefined } as const)
        : scopeKind === 'remote' && remoteHomeDirectory
          ? ({ kind: 'remote', homeDirectory: remoteHomeDirectory } as const)
          : null
    if (!scope) {
      return NO_PROFILES
    }
    return {
      pi: scopeAgentLaunchProfilesToHost(normalizeAgentLaunchProfiles(piLaunchProfiles), scope),
      claude: scopeAgentLaunchProfilesToHost(
        normalizeAgentLaunchProfiles(claudeLaunchProfiles),
        scope
      )
    }
  }, [claudeLaunchProfiles, piLaunchProfiles, remoteHomeDirectory, scopeKind])
}
