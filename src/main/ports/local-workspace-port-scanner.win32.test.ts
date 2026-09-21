import { createServer, type Server } from 'node:net'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('./port-scan-command-client', async () => {
  const { join } = await import('node:path')
  const { runProcess } = await import('../../shared/child-process/run-process')
  return {
    runPortScanCommand: async (command: string, args: string[]) => {
      const startedAt = Date.now()
      const result = await runProcess({
        program: join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', `${command}.exe`),
        args,
        timeoutMs: 10_000
      })
      if (result.code !== 0) {
        throw new Error(`${command} failed with code ${result.code}: ${result.stderr}`)
      }
      return { stdout: result.stdout, spawnMs: Date.now() - startedAt }
    }
  }
})

import { scanPlatformListeningPorts } from './local-workspace-platform-port-scanner'

const ownedListeners = new Set<Server>()

async function listen(host: '127.0.0.1' | '::1'): Promise<{ server: Server; port: number }> {
  const server = createServer()
  ownedListeners.add(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, host, () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error(`Expected an ephemeral TCP address for ${host}.`)
  }
  return { server, port: address.port }
}

async function close(server: Server): Promise<void> {
  if (!server.listening) {
    ownedListeners.delete(server)
    return
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  ownedListeners.delete(server)
}

afterEach(async () => {
  await Promise.all(Array.from(ownedListeners, close))
})

it.runIf(process.platform === 'win32')(
  'finds real ephemeral IPv4 and IPv6 listeners and drops them after owned sockets close',
  async () => {
    const ipv4 = await listen('127.0.0.1')
    const ipv6 = await listen('::1')

    const listeningScan = await scanPlatformListeningPorts({ requireMetadata: true })

    expect(listeningScan.ports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ host: '127.0.0.1', port: ipv4.port, pid: process.pid }),
        expect.objectContaining({ host: '::1', port: ipv6.port, pid: process.pid })
      ])
    )

    await close(ipv4.server)
    await close(ipv6.server)

    const closedScan = await scanPlatformListeningPorts({ requireMetadata: true })
    expect(
      closedScan.ports.some(
        (port) =>
          port.pid === process.pid &&
          ((port.host === '127.0.0.1' && port.port === ipv4.port) ||
            (port.host === '::1' && port.port === ipv6.port))
      )
    ).toBe(false)
  }
)
