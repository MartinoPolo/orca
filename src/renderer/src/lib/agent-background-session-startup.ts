import { useAppStore } from '@/store'
import { buildAgentStartupPlan, type AgentStartupPlan } from '@/lib/tui-agent-startup'
import type { LaunchAgentBackgroundSessionArgs } from '@/lib/agent-background-session-contract'
import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '../../../shared/tui-agent-launch-defaults'
import { requireTuiAgentConfig } from '../../../shared/require-tui-agent-config'
import { resolveAgentBackgroundLaunchHost } from '@/lib/agent-background-session-launch-host'
import { resolveLocalWindowsAgentStartupShell } from '../../../shared/windows-terminal-shell'
import { resolveAgentProfileLaunchInputs } from '@/lib/agent-profile-launch-inputs'
import { CLIENT_PLATFORM } from '@/lib/new-workspace'

export type AgentBackgroundSessionStartup = {
  worktreePath: string
  launchHost: ReturnType<typeof resolveAgentBackgroundLaunchHost>
  startupPlan: AgentStartupPlan
  trimmedPrompt: string
  hasPrompt: boolean
  isFollowupPath: boolean
}

/** Resolves where and with which command a background agent would launch, without starting it. */
export function planAgentBackgroundSession(
  args: Pick<
    LaunchAgentBackgroundSessionArgs,
    'agent' | 'worktreeId' | 'prompt' | 'agentLaunchProfile' | 'sessionOptions'
  >
): AgentBackgroundSessionStartup | null {
  const { agent, worktreeId } = args
  const store = useAppStore.getState()
  // Folder workspaces exist only in getKnownWorktreeById (#2989).
  const worktree = store.getKnownWorktreeById(worktreeId)
  const repo = worktree ? store.repos.find((entry) => entry.id === worktree.repoId) : null
  if (!worktree) {
    throw new Error('The target workspace is no longer available.')
  }
  // Folder launch ownership cannot be derived from a repo row (#2989).
  const launchHost = resolveAgentBackgroundLaunchHost({
    store,
    worktreeId,
    worktreePath: worktree.path,
    repo
  })
  const { platform: launchPlatform, isRemote } = launchHost
  const profileInputs = resolveAgentProfileLaunchInputs({
    agent,
    profile: args.agentLaunchProfile,
    state: store,
    worktreeId,
    resolvedLaunchPlatform: launchPlatform,
    clientPlatform: CLIENT_PLATFORM,
    commandOverrides: store.settings?.agentCmdOverrides ?? {},
    environment: resolveTuiAgentLaunchEnv(agent, store.settings?.agentDefaultEnv)
  })
  if (!profileInputs.ok) {
    throw new Error(
      `Launch profile "${args.agentLaunchProfile?.name ?? ''}" is not available on this workspace's host.`
    )
  }
  const startupShell = resolveLocalWindowsAgentStartupShell({
    platform: launchPlatform,
    isRemote,
    terminalWindowsShell: store.settings?.terminalWindowsShell
  })
  const trimmedPrompt = args.prompt?.trim() ?? ''
  const hasPrompt = trimmedPrompt.length > 0
  const isFollowupPath = requireTuiAgentConfig(agent).promptInjectionMode === 'stdin-after-start'
  const startupPlan = buildAgentStartupPlan({
    agent,
    prompt: hasPrompt && !isFollowupPath ? trimmedPrompt : '',
    cmdOverrides: profileInputs.commandOverrides,
    agentArgs: resolveTuiAgentLaunchArgs(agent, store.settings?.agentDefaultArgs),
    agentEnv: profileInputs.environment,
    // Why: an explicit pick replaces a conflicting default flag instead of being shadowed by it.
    ...(args.sessionOptions
      ? { sessionOptions: args.sessionOptions, sessionOptionsOverrideAgentArgs: true }
      : {}),
    platform: launchPlatform,
    shell: startupShell,
    isRemote,
    allowEmptyPromptLaunch: !hasPrompt || isFollowupPath
  })
  if (!startupPlan) {
    return null
  }
  return {
    worktreePath: worktree.path,
    launchHost,
    startupPlan,
    trimmedPrompt,
    hasPrompt,
    isFollowupPath
  }
}
