// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BranchEntryRow } from './branch-entry-row'
import { DiffLineCounts } from './diff-line-counts'

afterEach(cleanup)

describe('committed file presentation', () => {
  it('mutes committed rows while preserving status, counts and opening the diff', () => {
    const onOpen = vi.fn()
    const { container } = render(
      <BranchEntryRow
        entry={{ path: 'src/example.ts', status: 'modified', added: 12, removed: 3 }}
        currentWorktreeId="workspace"
        worktreePath="/workspace"
        onRevealInExplorer={vi.fn()}
        onOpen={onOpen}
        commentCount={0}
      />
    )

    const fileName = screen.getByText('example.ts')
    const row = fileName.closest('[draggable]')
    expect(row?.classList.contains('text-muted-foreground')).toBe(true)
    expect(fileName.classList.contains('text-foreground')).toBe(false)
    expect(screen.getByText('M')).toBeDefined()
    expect(screen.getByText('+12').style.color).toBe('var(--muted-foreground)')
    expect(screen.getByText('-3').style.color).toBe('var(--muted-foreground)')
    expect(container.innerHTML).not.toContain('--git-decoration-')

    fireEvent.click(fileName)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('keeps active change counts colored by default', () => {
    render(<DiffLineCounts added={12} removed={3} />)
    expect(screen.getByText('+12').style.color).toBe('var(--git-decoration-added)')
    expect(screen.getByText('-3').style.color).toBe('var(--git-decoration-deleted)')
  })

  it('omits absent or zero counts in muted rows', () => {
    const { container } = render(<DiffLineCounts added={0} muted />)
    expect(container.innerHTML).toBe('')
  })
})
