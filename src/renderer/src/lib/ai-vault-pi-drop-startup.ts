import type { AppState } from '@/store/types'
import type { AiVaultSessionDragPayload } from '@/lib/ai-vault-session-drag'
import { resolveAiVaultResumeStartupShell } from '@/lib/ai-vault-resume-shell'
import { getRendererAppPlatform } from '@/lib/renderer-app-platform'
import { resolvePiProfileLaunchTarget } from '@/lib/pi-profile-launch-target'
import {
  getLocalDefaultPiAgentDirectory,
  PiResumeProfileError,
  resolvePiResumeLaunchConfig
} from '@/lib/pi-profile-resume-provenance'
import { buildAgentResumeStartupPlan } from '@/lib/tui-agent-startup'
import type { SleepingAgentLaunchConfig } from '../../../shared/agent-session-resume'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'

export type AiVaultPiDropStartup = {
  command: string
  env?: Record<string, string>
  envToDelete?: string[]
  launchConfig?: SleepingAgentLaunchConfig
}

export type AiVaultPiDropStartupResult =
  | { ok: true; startup: AiVaultPiDropStartup }
  | { ok: false; blockedReason: string }

type AiVaultPiDropState = Pick<
  AppState,
  | 'activeRepoId'
  | 'activeWorktreeId'
  | 'folderWorkspaces'
  | 'projectGroups'
  | 'projects'
  | 'repos'
  | 'settings'
  | 'worktreesByRepo'
> &
  Parameters<typeof resolvePiProfileLaunchTarget>[0]

function payloadStartup(payload: AiVaultSessionDragPayload): AiVaultPiDropStartup {
  return {
    command: payload.command,
    ...(payload.env ? { env: payload.env } : {}),
    ...(payload.envToDelete ? { envToDelete: payload.envToDelete } : {}),
    ...(payload.launchConfig ? { launchConfig: payload.launchConfig } : {})
  }
}

export function resolveAiVaultPiDropStartup(args: {
  state: AiVaultPiDropState
  payload: AiVaultSessionDragPayload
  worktreeId: string
  platform?: NodeJS.Platform
  defaultAgentDirectory?: string
}): AiVaultPiDropStartupResult {
  const platform = args.platform ?? getRendererAppPlatform()
  const target = resolvePiProfileLaunchTarget(args.state, args.worktreeId, { platform })
  if (target === 'unresolved') {
    return {
      ok: false,
      blockedReason: 'Cannot resume Pi until the target workspace owner is available.'
    }
  }
  if (!args.payload.sessionExecutionHostId) {
    return {
      ok: false,
      blockedReason:
        'This Pi session does not have trusted host provenance, so Orca refused to resume it.'
    }
  }
  if (target === 'non-local') {
    return { ok: true, startup: payloadStartup(args.payload) }
  }
  if (args.payload.sessionExecutionHostId !== LOCAL_EXECUTION_HOST_ID) {
    return {
      ok: false,
      blockedReason:
        'This Pi session does not have trusted local-host provenance, so Orca refused to resume it locally.'
    }
  }

  const transcriptPath = args.payload.sessionFilePath?.trim()
  if (!transcriptPath) {
    return {
      ok: false,
      blockedReason: 'This Pi session has no transcript path, so Orca cannot resume it safely.'
    }
  }

  try {
    const launchConfig = resolvePiResumeLaunchConfig({
      transcriptPath,
      launchConfig: args.payload.launchConfig ?? { agentArgs: '', agentEnv: {} },
      profiles: args.state.settings?.piLaunchProfiles,
      defaultAgentDirectory: args.defaultAgentDirectory ?? getLocalDefaultPiAgentDirectory()
    })
    const startupPlan = buildAgentResumeStartupPlan({
      agent: 'pi',
      providerSession: {
        key: 'session_id',
        id: args.payload.sessionId,
        transcriptPath
      },
      cmdOverrides: args.state.settings?.agentCmdOverrides ?? {},
      platform,
      shell: resolveAiVaultResumeStartupShell({
        state: args.state,
        worktreeId: args.worktreeId,
        platform,
        isLocalSession: true
      }),
      agentArgs: launchConfig.agentArgs,
      agentEnv: launchConfig.agentEnv,
      ...(launchConfig.agentCommand ? { agentCommand: launchConfig.agentCommand } : {})
    })
    if (!startupPlan) {
      return { ok: false, blockedReason: 'This Pi session cannot be resumed safely.' }
    }
    return {
      ok: true,
      startup: {
        command: startupPlan.launchCommand,
        ...(startupPlan.env ? { env: startupPlan.env } : {}),
        launchConfig: startupPlan.launchConfig
      }
    }
  } catch (error) {
    return {
      ok: false,
      blockedReason:
        error instanceof PiResumeProfileError
          ? error.message
          : 'This Pi session cannot be associated with an account safely.'
    }
  }
}
