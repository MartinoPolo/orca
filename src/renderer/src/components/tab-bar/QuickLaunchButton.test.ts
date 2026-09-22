// @vitest-environment happy-dom

import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { QuickLaunchAgentMenuItems, shouldShowLaunchWatchdogTimeout } from './QuickLaunchButton'

const {
  shortcutLabelMock,
  storeState,
  openSettingsPageMock,
  openSettingsTargetMock,
  useDetectedAgentsMock,
  launchAgentInNewTabMock
} = vi.hoisted(() => {
  const storeState: {
    settings: {
      defaultTuiAgent: 'claude' | 'codex' | 'gemini' | 'pi' | 'blank' | null
      disabledTuiAgents: string[]
      piLaunchProfiles: { id: string; name: string; command: string; agentDirectory: string }[]
    }
    worktreesByRepo: Record<
      string,
      { id: string; repoId: string; path?: string; hostId?: string }[]
    >
    repos: { id: string; connectionId?: string | null; executionHostId?: string }[]
    activeWorktreeId: string
    ptyIdsByTabId: Record<string, string[]>
    tabsByWorktree: Record<string, { id: string; ptyId: string | null }[]>
    openSettingsPage: ReturnType<typeof vi.fn>
    openSettingsTarget: ReturnType<typeof vi.fn>
  } = {
    settings: {
      defaultTuiAgent: 'codex',
      disabledTuiAgents: [],
      piLaunchProfiles: []
    },
    worktreesByRepo: {},
    repos: [],
    activeWorktreeId: 'worktree-1',
    ptyIdsByTabId: {},
    tabsByWorktree: {},
    openSettingsPage: vi.fn(),
    openSettingsTarget: vi.fn()
  }
  return {
    shortcutLabelMock: vi.fn<() => string | null>(),
    storeState,
    openSettingsPageMock: vi.fn(),
    openSettingsTargetMock: vi.fn(),
    useDetectedAgentsMock: vi.fn(() => ({ detectedIds: ['claude', 'codex', 'gemini', 'pi'] })),
    launchAgentInNewTabMock: vi.fn()
  }
})

vi.mock('@/hooks/useDetectedAgents', () => ({
  useDetectedAgents: useDetectedAgentsMock
}))

vi.mock('@/hooks/useShortcutLabel', () => ({
  useOptionalShortcutLabel: shortcutLabelMock
}))

vi.mock('@/store', () => {
  const useAppStore = Object.assign(
    (selector: (state: typeof storeState) => unknown) => {
      return selector(storeState)
    },
    {
      getState: () => storeState
    }
  )

  return { useAppStore }
})

vi.mock('@/lib/agent-catalog', async () => {
  const ReactActual = (await vi.importActual('react')) as {
    createElement: typeof React.createElement
  }

  return {
    getAgentCatalog: () => [
      { id: 'claude', label: 'Claude' },
      { id: 'codex', label: 'Codex' },
      { id: 'gemini', label: 'Gemini' },
      { id: 'pi', label: 'Pi' }
    ],
    AgentIcon: ({ agent }: { agent: string }) => ReactActual.createElement('span', null, agent)
  }
})

vi.mock('@/components/ui/dropdown-menu', async () => {
  const ReactActual = (await vi.importActual('react')) as {
    createElement: typeof React.createElement
  }

  return {
    DropdownMenuItem: ({
      children,
      onSelect,
      ...props
    }: {
      children: React.ReactNode
      onSelect?: () => void
    }) => ReactActual.createElement('button', { ...props, onClick: onSelect }, children),
    DropdownMenuShortcut: ({ children }: { children: React.ReactNode }) =>
      ReactActual.createElement('span', { 'data-dropdown-shortcut': 'true' }, children)
  }
})

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string>) =>
    Object.entries(values ?? {}).reduce(
      (text, [key, value]) => text.replace(`{{${key}}}`, value),
      fallback
    )
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    message: vi.fn()
  }
}))

vi.mock('@/lib/launch-agent-in-new-tab', () => ({
  launchAgentInNewTab: launchAgentInNewTabMock
}))

function renderAgentMenuItems(): string {
  return renderToStaticMarkup(
    React.createElement(QuickLaunchAgentMenuItems, {
      worktreeId: 'worktree-1',
      groupId: 'group-1',
      onFocusTerminal: vi.fn()
    })
  )
}

function rowMarkup(html: string, label: string): string {
  const start = html.indexOf(`title="Launch ${label} in a new terminal"`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = html.indexOf('</button>', start)
  expect(end).toBeGreaterThan(start)

  return html.slice(start, end)
}

afterEach(cleanup)

beforeEach(() => {
  shortcutLabelMock.mockReset()
  shortcutLabelMock.mockReturnValue(null)
  useDetectedAgentsMock.mockClear()
  openSettingsPageMock.mockReset()
  openSettingsTargetMock.mockReset()
  storeState.settings.defaultTuiAgent = 'codex'
  storeState.settings.disabledTuiAgents = []
  storeState.settings.piLaunchProfiles = []
  storeState.worktreesByRepo = {
    'repo-1': [{ id: 'worktree-1', repoId: 'repo-1', path: '/repo/worktree' }]
  }
  storeState.repos = [{ id: 'repo-1', connectionId: null }]
  storeState.openSettingsPage = openSettingsPageMock
  storeState.openSettingsTarget = openSettingsTargetMock
  storeState.ptyIdsByTabId = {}
  storeState.tabsByWorktree = {}
  vi.mocked(toast.message).mockClear()
  vi.mocked(toast.error).mockClear()
  launchAgentInNewTabMock.mockReset()
  launchAgentInNewTabMock.mockReturnValue({ surface: { kind: 'host-published' } })
})

describe('QuickLaunchAgentMenuItems', () => {
  it('describes a pending terminal without claiming launch failure', async () => {
    vi.useFakeTimers()
    try {
      storeState.settings.piLaunchProfiles = [
        { id: 'work', name: 'piw', command: 'piw', agentDirectory: 'C:/accounts/work' }
      ]
      storeState.tabsByWorktree = { 'worktree-1': [{ id: 'launch-tab', ptyId: null }] }
      launchAgentInNewTabMock.mockReturnValue({
        surface: { kind: 'local-terminal', tabId: 'launch-tab' }
      })
      render(
        React.createElement(QuickLaunchAgentMenuItems, {
          worktreeId: 'worktree-1',
          groupId: 'group-1',
          onFocusTerminal: vi.fn()
        })
      )
      fireEvent.click(screen.getByRole('button', { name: /piw/ }))
      await vi.advanceTimersByTimeAsync(5000)

      expect(toast.message).toHaveBeenCalledWith('Still waiting for the piw terminal to start.')
      expect(toast.error).not.toHaveBeenCalled()
      storeState.ptyIdsByTabId = { 'launch-tab': ['late-pty'] }
      await vi.advanceTimersByTimeAsync(1000)
      expect(toast.message).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders exactly default pi and one piw profile while preserving dispatch inputs', async () => {
    const user = userEvent.setup()
    const piwProfile = {
      id: 'work',
      name: 'piw',
      command: 'C:/tools/piw',
      agentDirectory: 'C:/Users/ada/.pi-work/agent'
    }
    storeState.settings.defaultTuiAgent = 'pi'
    storeState.settings.piLaunchProfiles = [piwProfile]
    useDetectedAgentsMock.mockReturnValueOnce({ detectedIds: ['pi'] })
    render(
      React.createElement(QuickLaunchAgentMenuItems, {
        worktreeId: 'worktree-1',
        groupId: 'group-1',
        onFocusTerminal: vi.fn()
      })
    )

    const launchButtons = screen.getAllByTitle(/Launch .* in a new terminal/)
    expect(launchButtons.map((button) => button.title)).toEqual([
      'Launch pi in a new terminal',
      'Launch piw in a new terminal'
    ])

    await user.click(launchButtons[0])
    launchButtons[1].focus()
    await user.keyboard('{Enter}')

    expect(launchAgentInNewTabMock).toHaveBeenNthCalledWith(1, {
      agent: 'pi',
      worktreeId: 'worktree-1',
      groupId: 'group-1'
    })
    expect(launchAgentInNewTabMock).toHaveBeenNthCalledWith(2, {
      agent: 'pi',
      piLaunchProfile: piwProfile,
      worktreeId: 'worktree-1',
      groupId: 'group-1'
    })
  })

  it('renders the new-agent shortcut next to the configured default agent only', () => {
    shortcutLabelMock.mockReturnValue('⌘⌥T')

    const html = renderAgentMenuItems()

    expect(html.match(/data-dropdown-shortcut="true"/g) ?? []).toHaveLength(1)
    expect(rowMarkup(html, 'Codex')).toContain('⌘⌥T')
    expect(rowMarkup(html, 'Claude')).not.toContain('⌘⌥T')
    expect(rowMarkup(html, 'Gemini')).not.toContain('⌘⌥T')
  })

  it('hides the default-agent shortcut when the action is unbound', () => {
    shortcutLabelMock.mockReturnValue(null)

    const html = renderAgentMenuItems()

    expect(html).not.toContain('data-dropdown-shortcut="true"')
  })

  it('routes agent detection to the worktree-owning runtime host, not the local client', () => {
    // Repro for the "Remote Server lists local agents" bug: a worktree owned by
    // a paired runtime must probe that runtime, never the client's PATH.
    storeState.worktreesByRepo = {
      'repo-1': [{ id: 'worktree-1', repoId: 'repo-1', hostId: 'runtime:env-1' }]
    }
    storeState.repos = [{ id: 'repo-1' }]

    renderAgentMenuItems()

    expect(useDetectedAgentsMock).toHaveBeenLastCalledWith({
      kind: 'runtime',
      environmentId: 'env-1'
    })
  })

  it('prefers the paired runtime owner over its server-side SSH connection', () => {
    storeState.worktreesByRepo = {
      'repo-1': [{ id: 'worktree-1', repoId: 'repo-1' }]
    }
    storeState.repos = [
      {
        id: 'repo-1',
        connectionId: 'server-only-ssh-target',
        executionHostId: 'runtime:env-1'
      }
    ]

    renderAgentMenuItems()

    expect(useDetectedAgentsMock).toHaveBeenLastCalledWith({
      kind: 'runtime',
      environmentId: 'env-1'
    })
  })

  it('routes agent detection to the owning SSH host', () => {
    storeState.worktreesByRepo = {
      'repo-1': [{ id: 'worktree-1', repoId: 'repo-1' }]
    }
    storeState.repos = [{ id: 'repo-1', connectionId: 'ssh-target-1' }]

    renderAgentMenuItems()

    expect(useDetectedAgentsMock).toHaveBeenLastCalledWith({
      kind: 'ssh',
      connectionId: 'ssh-target-1'
    })
  })

  it('does not label an auto-picked or blank default as configured', () => {
    shortcutLabelMock.mockReturnValue('⌘⌥T')

    storeState.settings.defaultTuiAgent = null
    expect(renderAgentMenuItems()).not.toContain('data-dropdown-shortcut="true"')

    storeState.settings.defaultTuiAgent = 'blank'
    expect(renderAgentMenuItems()).not.toContain('data-dropdown-shortcut="true"')
  })
})

describe('shouldShowLaunchWatchdogTimeout', () => {
  it('does not report slow agent readiness once a PTY exists', () => {
    expect(
      shouldShowLaunchWatchdogTimeout({
        hasPty: true
      })
    ).toBe(false)
  })

  it('reports launches where no PTY appeared', () => {
    expect(
      shouldShowLaunchWatchdogTimeout({
        hasPty: false
      })
    ).toBe(true)
  })
})
