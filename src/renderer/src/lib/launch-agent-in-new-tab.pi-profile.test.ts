import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCreateTab = vi.fn(() => ({ id: 'tab-1' }))
const mockQueueTabStartupCommand = vi.fn()
const agentDefaultArgs: Record<string, string> = {}
const agentDefaultEnv: Record<string, Record<string, string>> = {}

type Project = {
  id: string
  localWindowsRuntimePreference: { kind: 'inherit-global' } | { kind: 'wsl'; distro: string | null }
}

const projects: Project[] = [
  { id: 'repo-1', localWindowsRuntimePreference: { kind: 'inherit-global' } }
]
const worktree = {
  id: 'wt-1',
  repoId: 'repo-1',
  projectId: 'repo-1',
  path: 'C:/repo/worktree',
  displayName: 'main'
}
const store = {
  activeRepoId: 'repo-1',
  activeWorktreeId: 'wt-1',
  settings: {
    agentCmdOverrides: {},
    agentDefaultArgs,
    agentDefaultEnv,
    activeRuntimeEnvironmentId: null
  },
  projects,
  repos: [{ id: 'repo-1', connectionId: null, path: 'C:/repo' }],
  folderWorkspaces: [],
  projectGroups: [],
  worktreesByRepo: { 'repo-1': [worktree] },
  allWorktrees: vi.fn(() => [worktree]),
  tabsByWorktree: { 'wt-1': [{ id: 'tab-1' }] },
  openFiles: [],
  browserTabsByWorktree: {},
  tabBarOrderByWorktree: {},
  createTab: mockCreateTab,
  queueTabStartupCommand: mockQueueTabStartupCommand,
  setActiveTabType: vi.fn(),
  setTabBarOrder: vi.fn()
}

vi.mock('@/store', () => ({ useAppStore: { getState: () => store } }))
vi.mock('@/lib/new-workspace', () => ({ CLIENT_PLATFORM: 'win32' }))
vi.mock('@/lib/renderer-app-platform', () => ({ getRendererAppPlatform: () => 'win32' }))
vi.mock('@/lib/connection-context', () => ({ getConnectionIdFromState: () => null }))
vi.mock('@/lib/worktree-runtime-owner', () => ({
  getKnownExecutionHostIdForWorktree: () => 'local',
  getRuntimeEnvironmentIdForWorktree: () => null
}))
vi.mock('@/lib/native-chat-transcript-readability', () => ({
  isNativeChatTranscriptLocalReadable: () => true
}))
vi.mock('@/runtime/web-runtime-session', () => ({ isWebRuntimeSessionActive: () => false }))
vi.mock('@/lib/agent-session-launch-plan', () => ({
  planAgentSessionLaunch: () => ({ route: 'terminal' })
}))
vi.mock('@/components/tab-bar/reconcile-order', () => ({
  reconcileTabOrder: (_stored: unknown, terminalIds: string[]) => terminalIds
}))
vi.mock('@/lib/telemetry', () => ({
  track: vi.fn(),
  tuiAgentToAgentKind: (agent: string) => agent
}))
vi.mock('@/components/native-chat/native-chat-session-option-cache', () => ({
  seedNativeChatAppliedSessionOptions: vi.fn()
}))

describe('launchAgentInNewTab named Pi profiles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projects.splice(0, projects.length, {
      id: 'repo-1',
      localWindowsRuntimePreference: { kind: 'inherit-global' }
    })
    delete agentDefaultArgs.pi
    delete agentDefaultEnv.pi
  })

  it('queues the concrete profile command and account-root snapshot', async () => {
    agentDefaultArgs.pi = '--model test'
    agentDefaultEnv.pi = { PI_THEME: 'dark' }
    const { launchAgentInNewTab } = await import('./launch-agent-in-new-tab')

    const result = launchAgentInNewTab({
      agent: 'pi',
      worktreeId: 'wt-1',
      piLaunchProfile: {
        id: 'work',
        name: 'Work',
        command: 'C:/tools/piw',
        agentDirectory: 'C:/Users/ada/.pi-work/agent'
      }
    })

    expect(result).not.toBeNull()
    expect(mockQueueTabStartupCommand).toHaveBeenCalledWith(
      'tab-1',
      expect.objectContaining({
        command: expect.stringContaining('C:/tools/piw'),
        env: {
          PI_THEME: 'dark',
          PI_CODING_AGENT_DIR: 'C:/Users/ada/.pi-work/agent',
          ORCA_PI_SOURCE_AGENT_DIR: 'C:/Users/ada/.pi-work/agent'
        },
        launchConfig: {
          agentCommand: expect.stringContaining('C:/tools/piw'),
          agentArgs: '--model test',
          agentEnv: {
            PI_THEME: 'dark',
            PI_CODING_AGENT_DIR: 'C:/Users/ada/.pi-work/agent',
            ORCA_PI_SOURCE_AGENT_DIR: 'C:/Users/ada/.pi-work/agent'
          }
        }
      })
    )
  })

  it('refuses profiles on WSL-owned workspaces without creating a tab', async () => {
    projects.splice(0, projects.length, {
      id: 'repo-1',
      localWindowsRuntimePreference: { kind: 'wsl', distro: 'Ubuntu' }
    })
    const { launchAgentInNewTab } = await import('./launch-agent-in-new-tab')

    expect(
      launchAgentInNewTab({
        agent: 'pi',
        worktreeId: 'wt-1',
        launchPlatform: 'linux',
        piLaunchProfile: {
          id: 'work',
          name: 'Work',
          command: '/c/tools/piw',
          agentDirectory: 'C:/Users/ada/.pi-work/agent'
        }
      })
    ).toBeNull()
    expect(mockCreateTab).not.toHaveBeenCalled()
  })
})
