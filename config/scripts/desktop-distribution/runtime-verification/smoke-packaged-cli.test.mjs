import { describe, expect, it, vi } from 'vitest'
import { runPackagedCliCommand } from './smoke-packaged-cli.mjs'

const cliPath = 'C:/copied/Orca/resources/bin/orca.exe'
const env = { NODE_PATH: '' }
const success = {
  code: 0,
  signal: null,
  stdout: 'ok',
  stderr: '',
  timedOut: false,
  outputTruncated: false
}

describe('packaged CLI smoke command', () => {
  it('runs the copied CLI with a tree-termination barrier and bounded output', async () => {
    const runProcess = vi.fn().mockResolvedValue(success)

    await expect(runPackagedCliCommand(runProcess, cliPath, ['--help'], env)).resolves.toEqual(
      success
    )
    expect(runProcess).toHaveBeenCalledExactlyOnceWith({
      program: cliPath,
      args: ['--help'],
      env,
      timeoutMs: 30_000,
      maxOutputBytes: 16 * 1024 * 1024,
      terminationBarrier: true
    })
  })

  it.each([
    [{ code: 2, stderr: 'invalid option' }, 'code=2'],
    [{ code: null, timedOut: true }, 'timedOut=true'],
    [{ code: 0, outputTruncated: true }, 'outputTruncated=true']
  ])('rejects an unsuccessful command result %j', async (result, reason) => {
    const runProcess = vi.fn().mockResolvedValue({ ...success, ...result })

    await expect(
      runPackagedCliCommand(runProcess, cliPath, ['skills', 'list', '--json'], env)
    ).rejects.toThrow(reason)
  })

  it('bounds stdout and stderr diagnostics on failure', async () => {
    const runProcess = vi.fn().mockResolvedValue({
      ...success,
      code: 1,
      stdout: 'a'.repeat(20_000),
      stderr: 'b'.repeat(20_000)
    })

    const failure = await runPackagedCliCommand(runProcess, cliPath, ['--help'], env).catch(
      (error) => error
    )
    expect(failure).toBeInstanceOf(Error)
    expect(failure.message).toContain('stdout:')
    expect(failure.message).toContain(`stdout: ${'a'.repeat(1024)}`)
    expect(failure.message).toContain(`stderr: ${'b'.repeat(1024)}`)
    expect(failure.message.length).toBeLessThan(2_500)
  })
})
