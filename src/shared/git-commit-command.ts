export type GitCommitResult = { success: boolean; error?: string }

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
  const error: unknown = Reflect.get(value, 'error')
  return {
    success: Reflect.get(value, 'success') === true,
    ...(typeof error === 'string' ? { error } : {})
  }
}

// Why: hook/GPG failures write to stderr while "nothing to commit" writes to stdout, so try both before the generic message.
export function readGitCommitFailureMessage(error: unknown, fallback: string): string {
  const readStringField = (field: string): string | null => {
    if (typeof error === 'object' && error !== null && field in error) {
      const value: unknown = Reflect.get(error, field)
      if (typeof value === 'string' && value.length > 0) {
        return value
      }
    }
    return null
  }
  return (
    readStringField('stderr') ??
    readStringField('stdout') ??
    (error instanceof Error ? error.message : fallback)
  )
}
