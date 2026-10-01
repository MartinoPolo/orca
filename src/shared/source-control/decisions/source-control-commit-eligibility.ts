export const COMMIT_MESSAGE_REQUIRED_REASON = 'Enter a commit message to commit' as const

export type CommitDisabledReason =
  | 'Resolve conflicts before committing'
  | 'Stage at least one file to commit'
  | typeof COMMIT_MESSAGE_REQUIRED_REASON

export type CommitEligibilityInputs = {
  stagedCount: number
  hasPartiallyStagedChanges: boolean
  hasMessage: boolean
  hasUnresolvedConflicts: boolean
  isCommitting: boolean
  isRemoteOperationActive: boolean
  isPullRequestOperationActive?: boolean
}

export function resolveCommitDisabledReason(
  inputs: Pick<
    CommitEligibilityInputs,
    'stagedCount' | 'hasPartiallyStagedChanges' | 'hasMessage' | 'hasUnresolvedConflicts'
  >
): CommitDisabledReason | null {
  if (inputs.hasUnresolvedConflicts) {
    return 'Resolve conflicts before committing'
  }
  if (inputs.stagedCount === 0) {
    return 'Stage at least one file to commit'
  }
  if (!inputs.hasMessage) {
    return COMMIT_MESSAGE_REQUIRED_REASON
  }
  return null
}

export type AmendDisabledReason =
  | 'Resolve conflicts before amending'
  | 'Stage changes or enter a new message to amend the last commit'

// Amend needs staged changes to fold in or a new message; an empty message keeps the old one.
export function resolveAmendDisabledReason(
  inputs: Pick<CommitEligibilityInputs, 'stagedCount' | 'hasMessage' | 'hasUnresolvedConflicts'>
): AmendDisabledReason | null {
  if (inputs.hasUnresolvedConflicts) {
    return 'Resolve conflicts before amending'
  }
  if (inputs.stagedCount === 0 && !inputs.hasMessage) {
    return 'Stage changes or enter a new message to amend the last commit'
  }
  return null
}

// An empty amend message keeps the existing one, so amend only needs some change to apply.
export function hasSubmittableCommitContent({
  amend,
  message,
  stagedCount,
  skipStagedSnapshotCheck
}: {
  amend: boolean
  message: string
  stagedCount: number
  skipStagedSnapshotCheck: boolean
}): boolean {
  const hasMessage = message !== ''
  const hasStagedContent = skipStagedSnapshotCheck || stagedCount > 0
  return amend ? hasMessage || hasStagedContent : hasMessage && hasStagedContent
}

function isCommitGloballyBusy(inputs: CommitEligibilityInputs): boolean {
  return (
    inputs.isCommitting ||
    inputs.isRemoteOperationActive ||
    (inputs.isPullRequestOperationActive ?? false)
  )
}

export function canSubmitCommit(inputs: CommitEligibilityInputs): boolean {
  return !isCommitGloballyBusy(inputs) && resolveCommitDisabledReason(inputs) === null
}

// Message-only amend needs typing without staged files; only conflicts and in-flight work lock editing.
export function isCommitMessageFieldDisabled(inputs: CommitEligibilityInputs): boolean {
  return isCommitGloballyBusy(inputs) || inputs.hasUnresolvedConflicts
}
