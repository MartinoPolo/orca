import { describe, expect, it } from 'vitest'
import {
  canSubmitCommit,
  hasSubmittableCommitContent,
  isCommitMessageFieldDisabled,
  resolveAmendDisabledReason
} from './source-control-commit-eligibility'

function baseInputs(
  overrides: Partial<Parameters<typeof canSubmitCommit>[0]> = {}
): Parameters<typeof canSubmitCommit>[0] {
  return {
    stagedCount: 1,
    hasPartiallyStagedChanges: false,
    hasMessage: true,
    hasUnresolvedConflicts: false,
    isCommitting: false,
    isRemoteOperationActive: false,
    ...overrides
  }
}

describe('amend eligibility', () => {
  it('keeps the message field editable when nothing is staged so amend can reword', () => {
    const inputs = baseInputs({ stagedCount: 0 })
    expect(canSubmitCommit(inputs)).toBe(false)
    expect(isCommitMessageFieldDisabled(inputs)).toBe(false)
  })

  it('disables the message field while conflicts are unresolved', () => {
    expect(isCommitMessageFieldDisabled(baseInputs({ hasUnresolvedConflicts: true }))).toBe(true)
  })

  it('allows amending with staged changes, a new message, or both', () => {
    expect(resolveAmendDisabledReason(baseInputs())).toBeNull()
    expect(resolveAmendDisabledReason(baseInputs({ hasMessage: false }))).toBeNull()
    expect(resolveAmendDisabledReason(baseInputs({ stagedCount: 0 }))).toBeNull()
  })

  it('blocks amending with nothing to change or unresolved conflicts', () => {
    expect(resolveAmendDisabledReason(baseInputs({ stagedCount: 0, hasMessage: false }))).toBe(
      'Stage changes or enter a new message to amend the last commit'
    )
    expect(resolveAmendDisabledReason(baseInputs({ hasUnresolvedConflicts: true }))).toBe(
      'Resolve conflicts before amending'
    )
  })

  it.each([
    {
      amend: false,
      message: 'msg',
      stagedCount: 0,
      skipStagedSnapshotCheck: false,
      expected: false
    },
    { amend: false, message: '', stagedCount: 1, skipStagedSnapshotCheck: false, expected: false },
    { amend: false, message: 'msg', stagedCount: 0, skipStagedSnapshotCheck: true, expected: true },
    { amend: true, message: 'msg', stagedCount: 0, skipStagedSnapshotCheck: false, expected: true },
    { amend: true, message: '', stagedCount: 1, skipStagedSnapshotCheck: false, expected: true },
    { amend: true, message: '', stagedCount: 0, skipStagedSnapshotCheck: false, expected: false }
  ])(
    'submittable content: amend=$amend message="$message" staged=$stagedCount -> $expected',
    ({ expected, ...inputs }) => {
      expect(hasSubmittableCommitContent(inputs)).toBe(expected)
    }
  )
})
