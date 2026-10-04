import type { AppState } from '@/store/types'
import type { AiVaultSessionDragPayload } from '@/lib/ai-vault-session-drag'
import { resolveAiVaultResumeStartupShell } from '@/lib/ai-vault-resume-shell'
import { getRendererAppPlatform } from '@/lib/renderer-app-platform'
import { resolveAgentProfileLaunchTarget } from '@/lib/agent-profile-launch-target'
import { AgentAccountResumeError } from '@/lib/agent-account-resume'
import { resolveAiVaultAccountLaunchInputs } from '@/lib/ai-vault-account-launch-inputs'
import { buildAiVaultResumeStartupForWorktree } from '@/lib/ai-vault-resume-command'
import {
  getLocalDefaultPiAgentDirectory,
  PiResumeProfileError,
  resolvePiResumeLaunchConfig
} from '@/lib/pi-profile-resume-provenance'
import { buildAgentResumeStartupPlan } from '@/lib/tui-agent-startup'
import type { SleepingAgentLaunchConfig } from '../../../shared/agent-session-resume'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '../../../shared/tui-agent-launch-defaults'

export type AiVaultAccountDropStartup = {
  command: string
  env?: Record<string, string>
  envToDelete?: string[]
  launchConfig?: SleepingAgentLaunchConfig
}

export type AiVaultAccountDropStartupResult =
  | { ok: true; startup: AiVaultAccountDropStartup }
  | { ok: false; blockedReason: string }

type AiVaultAccountDropState = Pick<
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
  Parameters<typeof resolveAgentProfileLaunchTarget>[0]

type AiVaultAccountDropArgs = {
  state: AiVaultAccountDropState
  payload: AiVaultSessionDragPayload
  worktreeId: string
  platform?: NodeJS.Platform
  defaultAgentDirectory?: string
}

function payloadStartup(payload: AiVaultSessionDragPayload): AiVaultAccountDropStartup {
  return {
    command: payload.command,
    ...(payload.env ? { env: payload.env } : {}),
    ...(payload.envToDelete ? { envToDelete: payload.envToDelete } : {}),
    ...(payload.launchConfig ? { launchConfig: payload.launchConfig } : {})
  }
}

/**
 * Rebuilds a dropped history session under the account that owns its transcript on the drop
 * target, or null when the prebuilt payload already is the right launch.
 *
 * Why: the payload was built for whichever workspace was active when the drag started.
 */
export function resolveAiVaultAccountDropStartup(
  args: AiVaultAccountDropArgs
): AiVaultAccountDropStartupResult | null {
  if (args.payload.agent === 'pi') {
    return resolvePiDropStartup(args)
  }
  return args.payload.agent === 'claude' ? resolveHostProfileDropStartup(args) : null
}

function resolvePiDropStartup(args: AiVaultAccountDropArgs): AiVaultAccountDropStartupResult {
  const platform = args.platform ?? getRendererAppPlatform()
  const target = resolveAgentProfileLaunchTarget(args.state, args.worktreeId, { platform })
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
    return (
      resolveHostProfileDropStartup(args) ?? { ok: true, startup: payloadStartup(args.payload) }
    )
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

function resolveHostProfileDropStartup(
  args: AiVaultAccountDropArgs
): AiVaultAccountDropStartupResult | null {
  const { payload, state } = args
  const transcriptPath = payload.sessionFilePath?.trim()
  if (!transcriptPath || !payload.sessionExecutionHostId) {
    return null
  }
  try {
    const { launchConfig } = resolveAiVaultAccountLaunchInputs({
      agent: payload.agent,
      transcriptPath,
      sessionExecutionHostId: payload.sessionExecutionHostId,
      worktreeId: args.worktreeId,
      state,
      agentArgs: resolveTuiAgentLaunchArgs(payload.agent, state.settings?.agentDefaultArgs),
      agentEnv: resolveTuiAgentLaunchEnv(payload.agent, state.settings?.agentDefaultEnv)
    })
    if (!launchConfig) {
      return null
    }
  } catch (error) {
    if (error instanceof AgentAccountResumeError || error instanceof PiResumeProfileError) {
      return { ok: false, blockedReason: error.message }
    }
    throw error
  }
  const startup = buildAiVaultResumeStartupForWorktree({
    state,
    worktreeId: args.worktreeId,
    session: {
      agent: payload.agent,
      sessionId: payload.sessionId,
      cwd: payload.sessionCwd ?? null,
      codexHome: payload.codexHome ?? null,
      executionHostId: payload.sessionExecutionHostId,
      filePath: transcriptPath
    },
    commandOverride: state.settings?.agentCmdOverrides?.[payload.agent]
  })
  if (startup.blockedReason) {
    return { ok: false, blockedReason: startup.blockedReason }
  }
  return {
    ok: true,
    startup: {
      command: startup.command,
      ...(startup.env ? { env: startup.env } : {}),
      ...(startup.envToDelete ? { envToDelete: startup.envToDelete } : {}),
      ...(startup.launchConfig ? { launchConfig: startup.launchConfig } : {})
    }
  }
}
