import { parseGitPushLease, type GitPushLease } from './git-push-lease'
export type { GitPushLease } from './git-push-lease'

export type GitCommitResult = { success: boolean; error?: string; pushLease?: GitPushLease }

export function buildGitCommitArgs(message: string): string[] {
  return ['commit', '-m', message]
}

// Why: an empty message keeps the amended commit's existing message instead of opening an editor.
export function buildGitAmendCommitArgs(message: string | undefined): string[] {
  const trimmedMessage = message?.trim() ?? ''
  return trimmedMessage.length > 0
    ? ['commit', '--amend', '-m', trimmedMessage]
    : ['commit', '--amend', '--no-edit']
}

// Why: relay replies cross a version boundary, so check the shape instead of asserting it.
export function parseGitCommitResult(value: unknown): GitCommitResult {
  if (typeof value !== 'object' || value === null) {
    return { success: false, error: 'Unexpected commit response from the remote host' }
  }
  const error = 'error' in value ? value.error : undefined
  const pushLease = parseGitPushLease('pushLease' in value ? value.pushLease : undefined)
  return {
    success: 'success' in value && value.success === true,
    ...(typeof error === 'string' ? { error } : {}),
    ...(pushLease ? { pushLease } : {})
  }
}

function nonEmptyStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

// Why: hook/GPG failures write to stderr while "nothing to commit" writes to stdout, so try both before the generic message.
export function readGitCommitFailureMessage(error: unknown, fallback: string): string {
  if (typeof error !== 'object' || error === null) {
    return fallback
  }
  return (
    nonEmptyStringOrNull('stderr' in error ? error.stderr : undefined) ??
    nonEmptyStringOrNull('stdout' in error ? error.stdout : undefined) ??
    (error instanceof Error ? error.message : fallback)
  )
}
