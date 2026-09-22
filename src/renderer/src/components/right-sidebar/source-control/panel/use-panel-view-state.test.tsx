// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../../../shared/constants'
import { SOURCE_CONTROL_AREAS } from '../listing/section-order'
import { useSourceControlPanelViewState } from './use-panel-view-state'

const settings = getDefaultSettings('/tmp')
const updateSettings = vi.fn(async () => undefined)

type HookProps = {
  activeWorktreeId: string | null
}

function renderViewState(initialProps: HookProps) {
  return renderHook(
    (props: HookProps) =>
      useSourceControlPanelViewState({
        activeWorktreeId: props.activeWorktreeId,
        settings,
        updateSettings
      }),
    { initialProps }
  )
}

describe('useSourceControlPanelViewState collapsed sections', () => {
  it('starts with branch and history collapsed while live groups remain open', () => {
    const { result } = renderViewState({ activeWorktreeId: 'worktree-a' })

    expect(result.current.collapsedSections).toEqual(new Set(['branch', 'history']))
    for (const area of SOURCE_CONTROL_AREAS) {
      expect(result.current.collapsedSections.has(area)).toBe(false)
    }
  })

  it('toggles the branch section and preserves expansion across an ordinary rerender', () => {
    const { result, rerender } = renderViewState({ activeWorktreeId: 'worktree-a' })

    act(() => result.current.toggleSection('branch'))
    expect(result.current.collapsedSections.has('branch')).toBe(false)

    rerender({ activeWorktreeId: 'worktree-a' })
    expect(result.current.collapsedSections.has('branch')).toBe(false)

    act(() => result.current.toggleSection('branch'))
    expect(result.current.collapsedSections.has('branch')).toBe(true)
  })

  it('resets an expanded branch when the active worktree changes', () => {
    const { result, rerender } = renderViewState({ activeWorktreeId: 'worktree-a' })

    act(() => result.current.toggleSection('branch'))
    expect(result.current.collapsedSections.has('branch')).toBe(false)

    rerender({ activeWorktreeId: 'worktree-b' })
    expect(result.current.collapsedSections).toEqual(new Set(['branch', 'history']))
  })
})
