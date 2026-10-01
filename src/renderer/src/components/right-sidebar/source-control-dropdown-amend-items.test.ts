import { describe, expect, it } from 'vitest'
import { resolveDropdownItems } from './source-control-dropdown-items'
import type { DropdownActionInputs, DropdownItem } from './source-control-dropdown-item-types'
import type { GitUpstreamStatus } from '../../../../shared/git-status-types'

function inputs(overrides: Partial<DropdownActionInputs> = {}): DropdownActionInputs {
  return {
    stagedCount: 0,
    hasUnstagedChanges: false,
    hasStageableChanges: false,
    hasPartiallyStagedChanges: false,
    hasMessage: false,
    hasUnresolvedConflicts: false,
    isCommitting: false,
    isRemoteOperationActive: false,
    upstreamStatus: undefined,
    ...overrides
  }
}

function amendRows(overrides: Partial<DropdownActionInputs>): {
  amend: DropdownItem
  amendForcePush: DropdownItem
} {
  const items = resolveDropdownItems(inputs(overrides))
  const amend = items.find((item): item is DropdownItem => item.kind === 'amend')
  const amendForcePush = items.find(
    (item): item is DropdownItem => item.kind === 'amend_force_push'
  )
  if (!amend || !amendForcePush) {
    throw new Error('amend rows missing')
  }
  return { amend, amendForcePush }
}

const UNPUSHED_HEAD: GitUpstreamStatus = { hasUpstream: true, ahead: 1, behind: 0 }
const PUBLISHED_HEAD: GitUpstreamStatus = { hasUpstream: true, ahead: 0, behind: 0 }

describe('amend rows', () => {
  it('offers only Amend Last Commit while HEAD is unpushed', () => {
    const { amend, amendForcePush } = amendRows({
      stagedCount: 1,
      upstreamStatus: UNPUSHED_HEAD
    })
    expect(amend.disabled).toBe(false)
    expect(amend.title).toBe('Add staged changes to the last commit, keeping its message')
    expect(amendForcePush.disabled).toBe(true)
    expect(amendForcePush.title).toBe('Last commit is not pushed yet — use Amend Last Commit')
  })

  it('treats a branch without upstream as unpushed', () => {
    const { amend, amendForcePush } = amendRows({
      hasMessage: true,
      upstreamStatus: { hasUpstream: false, ahead: 0, behind: 0 }
    })
    expect(amend.disabled).toBe(false)
    expect(amend.title).toBe('Replace the last commit message')
    expect(amendForcePush.disabled).toBe(true)
  })

  it('keeps Amend Last Commit enabled when the branch is both ahead and behind', () => {
    const { amend, amendForcePush } = amendRows({
      stagedCount: 1,
      upstreamStatus: { hasUpstream: true, ahead: 1, behind: 2 }
    })
    expect(amend.disabled).toBe(false)
    expect(amendForcePush.disabled).toBe(true)
  })

  it('offers only Amend & Force Push once HEAD is on the upstream', () => {
    const { amend, amendForcePush } = amendRows({
      stagedCount: 1,
      hasMessage: true,
      upstreamStatus: PUBLISHED_HEAD
    })
    expect(amend.disabled).toBe(true)
    expect(amend.title).toBe('Last commit is already pushed — use Amend & Force Push')
    expect(amendForcePush.disabled).toBe(false)
    expect(amendForcePush.title).toBe(
      'Add staged changes to the last commit and replace its message, then force push with lease'
    )
  })

  it('blocks Amend & Force Push when the remote has newer commits', () => {
    const { amendForcePush } = amendRows({
      stagedCount: 1,
      upstreamStatus: { hasUpstream: true, ahead: 0, behind: 2 }
    })
    expect(amendForcePush.disabled).toBe(true)
    expect(amendForcePush.title).toBe(
      'Pull first — the remote has commits newer than your last commit'
    )
  })

  it('refuses to amend with nothing staged and no new message', () => {
    const { amend } = amendRows({ upstreamStatus: UNPUSHED_HEAD })
    expect(amend.disabled).toBe(true)
    expect(amend.title).toBe('Stage changes or enter a new message to amend the last commit')
  })

  it('disables both rows while upstream status is loading', () => {
    const { amend, amendForcePush } = amendRows({ stagedCount: 1, hasMessage: true })
    expect(amend.disabled).toBe(true)
    expect(amend.title).toBe('Checking branch status…')
    expect(amendForcePush.disabled).toBe(true)
    expect(amendForcePush.title).toBe('Checking branch status…')
  })

  describe.each([
    { head: 'unpushed', upstreamStatus: UNPUSHED_HEAD },
    { head: 'published', upstreamStatus: PUBLISHED_HEAD }
  ])('with an $head HEAD', ({ upstreamStatus }) => {
    it.each<{ state: string; overrides: Partial<DropdownActionInputs> }>([
      { state: 'a commit is in flight', overrides: { isCommitting: true } },
      { state: 'a remote operation is in flight', overrides: { isRemoteOperationActive: true } },
      { state: 'conflicts remain', overrides: { hasUnresolvedConflicts: true } }
    ])('disables both rows while $state', ({ overrides }) => {
      const { amend, amendForcePush } = amendRows({
        stagedCount: 1,
        hasMessage: true,
        upstreamStatus,
        ...overrides
      })
      expect(amend.disabled).toBe(true)
      expect(amendForcePush.disabled).toBe(true)
    })
  })

  it('explains the conflict on the live row', () => {
    const { amendForcePush } = amendRows({
      stagedCount: 1,
      hasUnresolvedConflicts: true,
      upstreamStatus: PUBLISHED_HEAD
    })
    expect(amendForcePush.title).toBe('Resolve conflicts before amending')
  })
})
