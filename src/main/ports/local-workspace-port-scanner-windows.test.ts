import { afterEach, describe, expect, it, vi } from 'vitest'
import { attributePortToWorkspace } from './local-workspace-port-attribution'
import { scanWorkspacePorts } from './local-workspace-port-scanner'
import { resetWorkspacePortScanTimeoutBackoffForTests } from './local-workspace-port-scan-state'

const { readWindowsProcessTableMock, runPortScanCommandMock } = vi.hoisted(() => ({
  readWindowsProcessTableMock: vi.fn(),
  runPortScanCommandMock: vi.fn()
}))

vi.mock('./port-scan-command-client', () => ({
  runPortScanCommand: runPortScanCommandMock,
  isPortScanWorkerUnavailableError: () => false
}))

vi.mock('../windows/windows-process-table', () => ({
  readWindowsProcessTable: readWindowsProcessTableMock
}))

const windowsWorkspaces = [
  {
    id: 'repo::C:\\Projects\\Repo\\worktrees\\feature',
    repoId: 'repo',
    displayName: 'feature',
    path: 'C:\\Projects\\Repo\\worktrees\\feature'
  },
  {
    id: 'folder::C:\\Projects\\Folder App',
    repoId: 'folder',
    displayName: 'Folder App',
    path: 'C:\\Projects\\Folder App'
  }
]

const netstatOutput = [
  'Proto  Local Address          Foreign Address        State           PID',
  'TCP    127.0.0.1:4100         0.0.0.0:0              LISTENING       4101',
  'TCP    [::1]:4100             [::]:0                 LISTENING       4101',
  'TCP    0.0.0.0:4101           0.0.0.0:0              LISTENING       4101',
  'TCP    0.0.0.0:4101           0.0.0.0:0              LISTENING       4101',
  'TCP    [::]:4101              [::]:0                 LISTENING       4101',
  'TCP    [::]:4101              [::]:0                 LISTENING       4101',
  'TCP    [::1]:4100             [::]:0                 LISTENING       4101',
  'TCP    [::1]:4100             [::]:0                 LISTENING       4102',
  'TCP    [::1]:4103             [::]:0                 LISTENING       4101',
  'TCP    127.0.0.1:4200         0.0.0.0:0              LISTENING       4201',
  'UDP    127.0.0.1:4300         *:*                                    4301',
  'TCP    127.0.0.1:4400         127.0.0.1:5500         ESTABLISHED     4401'
].join('\n')

describe('Windows desktop workspace port scanning', () => {
  afterEach(() => {
    resetWorkspacePortScanTimeoutBackoffForTests()
    vi.restoreAllMocks()
    readWindowsProcessTableMock.mockReset()
    runPortScanCommandMock.mockReset()
  })

  it('dispatches unfiltered netstat and preserves TCP listener identity and attribution', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    runPortScanCommandMock.mockResolvedValue({ stdout: netstatOutput, spawnMs: 5 })
    readWindowsProcessTableMock.mockResolvedValue([
      {
        pid: 4101,
        name: 'node.exe',
        command:
          '"C:\\Program Files\\nodejs\\node.exe" C:\\Projects\\Repo\\worktrees\\feature\\node_modules\\vite\\bin\\vite.js'
      },
      {
        pid: 4201,
        name: 'node.exe',
        command: 'node "C:\\Projects\\Folder App\\server.js"'
      }
    ])

    const scan = await scanWorkspacePorts(windowsWorkspaces, {
      lookup: () => undefined,
      reconcileScan: vi.fn()
    })

    expect(runPortScanCommandMock).toHaveBeenCalledOnce()
    expect(runPortScanCommandMock).toHaveBeenCalledWith('netstat', ['-ano'])
    expect(scan.ports).toHaveLength(7)
    expect(scan.ports.filter((port) => port.pid === 4101)).toHaveLength(5)
    expect(scan.ports.filter((port) => port.pid === 4102)).toHaveLength(1)
    const wildcardPorts = scan.ports.filter((port) => port.pid === 4101 && port.port === 4101)
    expect(wildcardPorts).toHaveLength(2)
    expect(wildcardPorts.map((port) => port.id)).toEqual(
      expect.arrayContaining(['0.0.0.0:4101:4101', ':::4101:4101'])
    )
    expect(scan.ports.filter((port) => port.port === 4100)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bindHost: '127.0.0.1', pid: 4101 }),
        expect.objectContaining({ bindHost: '::1', pid: 4101 }),
        expect.objectContaining({ bindHost: '::1', pid: 4102 })
      ])
    )
    expect(scan.ports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bindHost: '0.0.0.0', connectHost: 'localhost', port: 4101 }),
        expect.objectContaining({ bindHost: '::', connectHost: 'localhost', port: 4101 }),
        expect.objectContaining({
          port: 4200,
          owner: expect.objectContaining({ worktreeId: windowsWorkspaces[1].id })
        }),
        expect.objectContaining({ pid: 4102, kind: 'external', processName: undefined })
      ])
    )
    expect(
      scan.ports
        .filter((port) => port.pid === 4101)
        .every(
          (port) => port.kind === 'workspace' && port.owner.worktreeId === windowsWorkspaces[0].id
        )
    ).toBe(true)
    expect(scan.ports.some((port) => port.port === 4300 || port.port === 4400)).toBe(false)
  })

  it('uses Windows path semantics without reinterpreting remote POSIX paths', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const candidates = [
      windowsWorkspaces[0],
      {
        id: 'folder::\\\\server\\share\\Repo',
        repoId: 'network-folder',
        displayName: 'Network folder',
        path: '\\\\server\\share\\Repo'
      },
      {
        id: 'folder::/srv/remote-repo',
        repoId: 'remote-folder',
        displayName: 'Remote folder',
        path: '/srv/remote-repo'
      }
    ]

    expect(
      attributePortToWorkspace(
        { commandLine: 'node C:\\Projects\\Repo\\worktrees\\feature\\server.js' },
        candidates
      )
    ).toMatchObject({ worktreeId: windowsWorkspaces[0].id })
    expect(
      attributePortToWorkspace(
        { commandLine: 'node "\\\\server\\share\\Repo\\packages\\app\\server.js"' },
        candidates
      )
    ).toMatchObject({ worktreeId: 'folder::\\\\server\\share\\Repo' })
    expect(
      attributePortToWorkspace({ cwd: '/srv/remote-repo/packages/app' }, candidates)
    ).toMatchObject({ worktreeId: 'folder::/srv/remote-repo' })
  })
})
