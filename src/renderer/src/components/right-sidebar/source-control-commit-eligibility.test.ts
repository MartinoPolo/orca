import { describe, expect, it } from 'vitest'
import {
  canSubmitCommit,
  COMMIT_MESSAGE_REQUIRED_REASON,
  hasSubmittableCommitContent,
  isCommitMessageFieldDisabled,
  resolveAmendDisabledReason,
  resolveCommitDisabledReason
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

describe('source-control-commit-eligibility', () => {
  it('returns null when commit prerequisites are satisfied', () => {
    expect(resolveCommitDisabledReason(baseInputs())).toBeNull()
    expect(canSubmitCommit(baseInputs())).toBe(true)
    expect(isCommitMessageFieldDisabled(baseInputs())).toBe(false)
  })

  it('keeps the message field enabled when only the message is missing', () => {
    const inputs = baseInputs({ hasMessage: false })
    expect(resolveCommitDisabledReason(inputs)).toBe(COMMIT_MESSAGE_REQUIRED_REASON)
    expect(canSubmitCommit(inputs)).toBe(false)
    expect(isCommitMessageFieldDisabled(inputs)).toBe(false)
  })

  it('allows committing the staged index when files are partially staged', () => {
    const inputs = baseInputs({ hasPartiallyStagedChanges: true })
    expect(resolveCommitDisabledReason(inputs)).toBeNull()
    expect(canSubmitCommit(inputs)).toBe(true)
    expect(isCommitMessageFieldDisabled(inputs)).toBe(false)
  })

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

  it('disables the message field while commit or remote work is in flight', () => {
    expect(isCommitMessageFieldDisabled(baseInputs({ isCommitting: true }))).toBe(true)
    expect(isCommitMessageFieldDisabled(baseInputs({ isRemoteOperationActive: true }))).toBe(true)
    expect(isCommitMessageFieldDisabled(baseInputs({ isPullRequestOperationActive: true }))).toBe(
      true
    )
  })

  describe('hasSubmittableCommitContent', () => {
    it.each([
      {
        amend: false,
        message: 'msg',
        stagedCount: 1,
        skipStagedSnapshotCheck: false,
        submittable: true
      },
      {
        amend: false,
        message: 'msg',
        stagedCount: 0,
        skipStagedSnapshotCheck: true,
        submittable: true
      },
      {
        amend: false,
        message: 'msg',
        stagedCount: 0,
        skipStagedSnapshotCheck: false,
        submittable: false
      },
      {
        amend: false,
        message: '',
        stagedCount: 1,
        skipStagedSnapshotCheck: false,
        submittable: false
      },
      {
        amend: false,
        message: '',
        stagedCount: 0,
        skipStagedSnapshotCheck: true,
        submittable: false
      },
      {
        amend: true,
        message: 'msg',
        stagedCount: 0,
        skipStagedSnapshotCheck: false,
        submittable: true
      },
      {
        amend: true,
        message: '',
        stagedCount: 1,
        skipStagedSnapshotCheck: false,
        submittable: true
      },
      {
        amend: true,
        message: '',
        stagedCount: 0,
        skipStagedSnapshotCheck: true,
        submittable: true
      },
      {
        amend: true,
        message: '',
        stagedCount: 0,
        skipStagedSnapshotCheck: false,
        submittable: false
      }
    ])(
      'amend=$amend message="$message" staged=$stagedCount skip=$skipStagedSnapshotCheck -> $submittable',
      ({ submittable, ...inputs }) => {
        expect(hasSubmittableCommitContent(inputs)).toBe(submittable)
      }
    )
  })
})
