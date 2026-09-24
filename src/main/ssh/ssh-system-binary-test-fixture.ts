import { vi, type Mock } from 'vitest'

export const SYSTEM_SSH_PATH =
  process.platform === 'win32' ? 'C:\\Windows\\System32\\OpenSSH\\ssh.exe' : '/usr/bin/ssh'
const SYSTEM_SFTP_PATH =
  process.platform === 'win32' ? 'C:\\Windows\\System32\\OpenSSH\\sftp.exe' : '/usr/bin/sftp'

export function mockSystemSshExists(existsSyncMock: Mock, statSyncMock: Mock): void {
  vi.stubEnv('ORCA_SYSTEM_SSH_PATH', '')
  vi.stubEnv('ORCA_SYSTEM_SFTP_PATH', '')
  if (process.platform === 'win32') {
    vi.stubEnv('SystemRoot', 'C:\\Windows')
  }
  statSyncMock.mockReset().mockImplementation((path: string) => {
    if (path === SYSTEM_SFTP_PATH) {
      return { isFile: () => true }
    }
    throw new Error('missing binary on PATH')
  })
  existsSyncMock.mockImplementation((path: string) => path === SYSTEM_SSH_PATH)
}
