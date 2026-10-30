// @vitest-environment happy-dom
import { useRef } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { NewWorkspaceComposerCardProps } from './new-workspace/new-workspace-composer-card-props'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../../shared/constants'
import { RUNTIME_CAPABILITIES } from '../../../shared/protocol-version'
import { setLocalRuntimeCapabilitiesForTests } from '@/runtime/local-runtime-capabilities'
import type { HostStructuredAgentAvailability } from '@/runtime/host-structured-agent-availability'
import { TooltipProvider } from '@/components/ui/tooltip'
import AgentCombobox from '@/components/agent/AgentCombobox'
import { AGENT_CATALOG } from '@/lib/agent-catalog'
import NewWorkspaceComposerModal from './NewWorkspaceComposerModal'
import type { AgentProfileSelection } from '../../../shared/agent-launch-profile-agents'

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  host: 'local',
  profiles: new Array<AgentProfileSelection>(),
  availability: vi.fn<() => HostStructuredAgentAvailability>()
}))
vi.mock('@/runtime/use-host-structured-agent-availability', () => ({
  useHostStructuredAgentAvailability: mocks.availability
}))
vi.mock('@/components/agent/AgentSettingsDialog', () => ({ default: () => null }))
vi.mock('@/hooks/useDetectedAgents', () => ({
  useDetectedAgents: () => ({
    detectedIds: ['claude', 'opencode'],
    isLoading: false,
    detectionFailed: false,
    needsServerUpdate: false
  })
}))
vi.mock('@/hooks/useComposerState', () => ({
  useComposerState: () => ({
    cardProps: {
      projectOptions: [],
      selectedRepoIsGit: true,
      detectedAgentIds: new Set(['claude', 'opencode']),
      agentProfileOptions: mocks.profiles,
      agentRows: {
        target: { workspace: { kind: 'git-worktree', executionHostId: mocks.host } },
        detectionTarget: { kind: 'local' }
      }
    },
    composerRef: useRef(null),
    submitQuick: mocks.submit,
    createDisabled: false
  })
}))
// Keep the actual owner/handler and picker; unrelated project/name fields are outside this seam.
vi.mock('@/components/NewWorkspaceComposerCard', () => ({
  default: (p: NewWorkspaceComposerCardProps) => (
    <div ref={p.composerRef}>
      <AgentCombobox
        agents={AGENT_CATALOG}
        value={p.quickAgent}
        onValueChange={p.onQuickAgentChange}
        allowBlankTerminal
        surfaceRows={p.agentSurfaceRows}
        agentProfiles={p.agentProfiles}
      />
      <button onClick={p.onCreate} disabled={p.createDisabled}>
        Create
      </button>
      <button onClick={() => p.onQuickAgentChange(null)}>Blank</button>
      <button onClick={p.onQuickSetupOnlySelect}>Setup only</button>
      <button onClick={() => p.onQuickAgentChange('claude', 'terminal')}>Choose CLI</button>
      <button onClick={() => p.onQuickAgentChange('claude', 'chat')}>Choose chat</button>
    </div>
  )
}))
const initial = useAppStore.getState()
beforeEach(() => {
  mocks.submit.mockReset()
  mocks.host = 'local'
  mocks.profiles = []
  mocks.availability.mockReturnValue({ state: 'pending' })
  setLocalRuntimeCapabilitiesForTests(RUNTIME_CAPABILITIES)
  useAppStore.setState({
    activeModal: 'new-workspace-composer',
    modalData: {},
    settings: {
      ...getDefaultSettings('/test'),
      experimentalNativeChat: true,
      defaultTuiAgent: 'claude'
    }
  })
})
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
})
const create = () => screen.getByRole('button', { name: 'Create' })
const submit = async () => {
  await act(async () => fireEvent.click(create()))
}

it('gates the selected chat at click/keyboard, preserves terminal and blank exceptions, and repairs host changes', async () => {
  setLocalRuntimeCapabilitiesForTests(null)
  const view = render(<NewWorkspaceComposerModal />, { wrapper: TooltipProvider })
  expect(create().hasAttribute('disabled')).toBe(true)
  await submit()
  fireEvent.keyDown(create(), { key: 'Enter', ctrlKey: true })
  fireEvent.keyDown(create(), { key: 'Enter', metaKey: true })
  expect(mocks.submit).not.toHaveBeenCalled()
  act(() => setLocalRuntimeCapabilitiesForTests(RUNTIME_CAPABILITIES))
  fireEvent.click(screen.getByText('Blank'))
  await submit()
  expect(mocks.submit).toHaveBeenLastCalledWith(null, expect.objectContaining({ setupOnly: false }))
  fireEvent.click(screen.getByText('Setup only'))
  await submit()
  expect(mocks.submit).toHaveBeenLastCalledWith(null, expect.objectContaining({ setupOnly: true }))
  fireEvent.click(screen.getByText('Choose CLI'))
  expect(screen.getByRole('combobox').textContent).toContain('Claude (CLI)')
  await submit()
  expect(mocks.submit.mock.calls.at(-1)?.[1].launchChoice).toMatchObject({
    route: 'terminal-tui',
    requestedSurface: 'terminal'
  })
  mocks.availability.mockReturnValue({
    state: 'received',
    byAgent: new Map([['claude', { agent: 'claude', state: 'available' }]])
  })
  fireEvent.click(screen.getByText('Choose chat'))
  await submit()
  expect(mocks.submit.mock.calls.at(-1)?.[1].launchChoice).toMatchObject({
    route: 'structured-native-chat',
    requestedSurface: 'chat'
  })
  mocks.host = 'ssh:other'
  view.rerender(<NewWorkspaceComposerModal />)
  expect(screen.getByRole('combobox').textContent).toContain('Claude (CLI)')
  await submit()
  expect(mocks.submit.mock.calls.at(-1)?.[1].launchChoice).toMatchObject({
    route: 'terminal-tui',
    requestedSurface: 'terminal'
  })
})

it('submits the untouched refusal-aware OpenCode CLI instead of the registered catalog chat', async () => {
  mocks.availability.mockReturnValue({
    state: 'received',
    byAgent: new Map([['opencode', { agent: 'opencode', state: 'refused' }]])
  })
  render(<NewWorkspaceComposerModal />, { wrapper: TooltipProvider })
  act(() =>
    useAppStore.setState({
      settings: {
        ...getDefaultSettings('/test'),
        experimentalNativeChat: true,
        defaultTuiAgent: 'opencode'
      }
    })
  )
  expect(screen.getByRole('combobox').textContent).toContain('OpenCode (CLI)')
  await submit()
  expect(mocks.submit.mock.calls[0][1].launchChoice).toMatchObject({
    agent: 'opencode',
    route: 'terminal-tui'
  })
  expect(mocks.submit.mock.calls[0][1].launchChoice.requestedSurface).toBeUndefined()
})

it('submits a picked launch profile as a terminal launch and drops it on an agent pick', async () => {
  const workProfile: AgentProfileSelection = {
    agent: 'claude',
    profile: { id: 'work', name: 'ccw', command: 'ccw', agentDirectory: '/accounts/claude-work' }
  }
  mocks.profiles = [workProfile]
  render(<NewWorkspaceComposerModal />, { wrapper: TooltipProvider })
  // The picker stays closed while the default chat pick is unresolved.
  fireEvent.click(screen.getByText('Choose CLI'))
  fireEvent.click(screen.getByRole('combobox'))
  fireEvent.click(screen.getByRole('option', { name: 'ccw' }))
  expect(screen.getByRole('combobox').textContent).toBe('ccw')
  // A profile starts its own command in a terminal, so chat discovery does not gate it.
  act(() => setLocalRuntimeCapabilitiesForTests(null))
  expect(create().hasAttribute('disabled')).toBe(false)
  await submit()
  expect(mocks.submit).toHaveBeenLastCalledWith(
    'claude',
    expect.objectContaining({ agentProfile: workProfile })
  )
  act(() => setLocalRuntimeCapabilitiesForTests(RUNTIME_CAPABILITIES))
  fireEvent.click(screen.getByText('Choose CLI'))
  await submit()
  expect(mocks.submit.mock.calls.at(-1)?.[1].agentProfile).toBeUndefined()
})
