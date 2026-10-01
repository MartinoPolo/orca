import { describe, expect, it } from 'vitest'
import {
  buildGitAmendCommitArgs,
  buildGitCommitArgs,
  parseGitCommitResult,
  readGitCommitFailureMessage
} from './git-commit-command'

describe('buildGitCommitArgs', () => {
  it('passes the message as a single argument', () => {
    expect(buildGitCommitArgs('feat: add "quoted" $value')).toEqual([
      'commit',
      '-m',
      'feat: add "quoted" $value'
    ])
  })
})

describe('buildGitAmendCommitArgs', () => {
  it.each([
    { label: 'undefined', message: undefined },
    { label: 'empty', message: '' },
    { label: 'whitespace', message: ' \n\t ' }
  ])('keeps the existing message for a $label message', ({ message }) => {
    expect(buildGitAmendCommitArgs(message)).toEqual(['commit', '--amend', '--no-edit'])
  })

  it('replaces the message with its trimmed text', () => {
    expect(buildGitAmendCommitArgs('  feat: reworded  \n')).toEqual([
      'commit',
      '--amend',
      '-m',
      'feat: reworded'
    ])
  })
})

describe('readGitCommitFailureMessage', () => {
  const fallback = 'Commit failed'

  it.each([
    {
      label: 'stderr over stdout and the error message',
      error: Object.assign(new Error('Command failed'), {
        stderr: 'hook rejected',
        stdout: 'nothing to commit'
      }),
      expected: 'hook rejected'
    },
    {
      label: 'stdout when stderr is empty',
      error: Object.assign(new Error('Command failed'), {
        stderr: '',
        stdout: 'nothing to commit'
      }),
      expected: 'nothing to commit'
    },
    {
      label: 'the error message when both streams are empty',
      error: Object.assign(new Error('Command failed'), { stderr: '', stdout: '' }),
      expected: 'Command failed'
    },
    {
      label: 'the error message when streams are not strings',
      error: Object.assign(new Error('Command failed'), { stderr: 42, stdout: null }),
      expected: 'Command failed'
    },
    {
      label: 'stdout from a non-Error object',
      error: { stdout: 'nothing to commit' },
      expected: 'nothing to commit'
    },
    { label: 'the fallback for an empty object', error: {}, expected: fallback },
    { label: 'the fallback for a string', error: 'boom', expected: fallback },
    { label: 'the fallback for null', error: null, expected: fallback }
  ])('reads $label', ({ error, expected }) => {
    expect(readGitCommitFailureMessage(error, fallback)).toBe(expected)
  })
})

describe('parseGitCommitResult', () => {
  it('keeps a well-formed relay reply', () => {
    expect(parseGitCommitResult({ success: true })).toEqual({ success: true })
    expect(parseGitCommitResult({ success: false, error: 'hook failed' })).toEqual({
      success: false,
      error: 'hook failed'
    })
  })

  it('preserves the pre-amend lease and omits absent or malformed leases from older hosts', () => {
    const pushLease = {
      expectedHead: 'a'.repeat(40),
      pushTarget: { remoteName: 'fork', branchName: 'review/topic' }
    }
    expect(parseGitCommitResult({ success: true, pushLease })).toEqual({ success: true, pushLease })
    expect(parseGitCommitResult({ success: true, pushLease: { expectedHead: 'HEAD' } })).toEqual({
      success: true
    })
    expect(parseGitCommitResult({ success: true })).toEqual({ success: true })
  })

  it('treats a malformed reply as a failure instead of trusting it', () => {
    expect(parseGitCommitResult(null).success).toBe(false)
    expect(parseGitCommitResult({ success: 'yes', error: 42 })).toEqual({ success: false })
  })
})
