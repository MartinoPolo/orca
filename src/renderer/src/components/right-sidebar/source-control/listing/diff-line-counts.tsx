import React from 'react'

// Why: use git decoration tokens so counts follow the documented light/dark status palette.
export function DiffLineCounts({
  added,
  removed,
  muted = false
}: {
  added?: number
  removed?: number
  muted?: boolean
}): React.JSX.Element | null {
  const hasAdded = typeof added === 'number' && added > 0
  const hasRemoved = typeof removed === 'number' && removed > 0
  if (!hasAdded && !hasRemoved) {
    return null
  }
  return (
    <span className="shrink-0 tabular-nums text-[10px]">
      {hasAdded && (
        <span style={{ color: muted ? 'var(--muted-foreground)' : 'var(--git-decoration-added)' }}>
          +{added}
        </span>
      )}
      {hasAdded && hasRemoved && <span> </span>}
      {hasRemoved && (
        <span
          style={{ color: muted ? 'var(--muted-foreground)' : 'var(--git-decoration-deleted)' }}
        >
          -{removed}
        </span>
      )}
    </span>
  )
}
