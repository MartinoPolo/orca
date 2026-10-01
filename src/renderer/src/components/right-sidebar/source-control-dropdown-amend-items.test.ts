import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n/i18n'
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

describe('amend row localization', () => {
  beforeEach(async () => {
    i18n.addResourceBundle('amendtest', 'translation', {
      'auto.components.right.sidebar.source.control.dropdown.amend.items.label': 'Amend translated',
      'auto.components.right.sidebar.source.control.dropdown.amend.items.forcePushLabel':
        'Force amend translated',
      'auto.components.right.sidebar.source.control.dropdown.amend.items.changesAndMessage':
        'Changes and message translated',
      'auto.components.right.sidebar.source.control.dropdown.amend.items.changesOnly':
        'Changes only translated',
      'auto.components.right.sidebar.source.control.dropdown.amend.items.messageOnly':
        'Message only translated',
      'auto.components.right.sidebar.source.control.dropdown.amend.items.forcePushChangesAndMessage':
        'Force changes and message translated',
      'auto.components.right.sidebar.source.control.dropdown.amend.items.forcePushChangesOnly':
        'Force changes only translated',
      'auto.components.right.sidebar.source.control.dropdown.amend.items.forcePushMessageOnly':
        'Force message only translated',
      'auto.components.right.sidebar.source.control.dropdown.amend.items.checkingBranchStatus':
        'Checking translated',
      'auto.components.right.sidebar.source.control.dropdown.amend.items.alreadyPushed':
        'Already pushed translated',
      'auto.components.right.sidebar.source.control.dropdown.amend.items.notPushed':
        'Not pushed translated',
      'auto.components.right.sidebar.source.control.dropdown.amend.items.pullFirst':
        'Pull first translated',
      'auto.components.right.sidebar.source.control.commit.eligibility.amendConflicts':
        'Conflicts translated',
      'auto.components.right.sidebar.source.control.commit.eligibility.amendChangesRequired':
        'Changes required translated'
    })
    await i18n.changeLanguage('amendtest')
  })

  afterEach(async () => {
    await i18n.changeLanguage('en')
    i18n.removeResourceBundle('amendtest', 'translation')
  })

  it('translates labels after switching language at runtime', async () => {
    const localized = amendRows({ stagedCount: 1, upstreamStatus: UNPUSHED_HEAD })
    expect(localized.amend.label).toBe('Amend translated')
    expect(localized.amendForcePush.label).toBe('Force amend translated')
    await i18n.changeLanguage('en')
    const english = amendRows({ stagedCount: 1, upstreamStatus: UNPUSHED_HEAD })
    expect(english.amend.label).toBe('Amend Last Commit')
    expect(english.amendForcePush.label).toBe('Amend & Force Push')
  })

  it.each([
    {
      stagedCount: 1,
      hasMessage: true,
      description: 'Changes and message translated',
      forceDescription: 'Force changes and message translated'
    },
    {
      stagedCount: 1,
      hasMessage: false,
      description: 'Changes only translated',
      forceDescription: 'Force changes only translated'
    },
    {
      stagedCount: 0,
      hasMessage: true,
      description: 'Message only translated',
      forceDescription: 'Force message only translated'
    }
  ])(
    'translates complete descriptions with staged=$stagedCount message=$hasMessage',
    ({ stagedCount, hasMessage, description, forceDescription }) => {
      expect(
        amendRows({ stagedCount, hasMessage, upstreamStatus: UNPUSHED_HEAD }).amend.title
      ).toBe(description)
      expect(
        amendRows({ stagedCount, hasMessage, upstreamStatus: PUBLISHED_HEAD }).amendForcePush.title
      ).toBe(forceDescription)
    }
  )

  it.each<{ overrides: Partial<DropdownActionInputs>; amendTitle: string; forceTitle: string }>([
    { overrides: {}, amendTitle: 'Checking translated', forceTitle: 'Checking translated' },
    {
      overrides: { stagedCount: 1, upstreamStatus: UNPUSHED_HEAD },
      amendTitle: 'Changes only translated',
      forceTitle: 'Not pushed translated'
    },
    {
      overrides: { stagedCount: 1, upstreamStatus: PUBLISHED_HEAD },
      amendTitle: 'Already pushed translated',
      forceTitle: 'Force changes only translated'
    },
    {
      overrides: { stagedCount: 1, upstreamStatus: { ...PUBLISHED_HEAD, behind: 1 } },
      amendTitle: 'Already pushed translated',
      forceTitle: 'Pull first translated'
    },
    {
      overrides: { hasUnresolvedConflicts: true, upstreamStatus: UNPUSHED_HEAD },
      amendTitle: 'Conflicts translated',
      forceTitle: 'Not pushed translated'
    },
    {
      overrides: { upstreamStatus: UNPUSHED_HEAD },
      amendTitle: 'Changes required translated',
      forceTitle: 'Not pushed translated'
    },
    {
      overrides: { hasUnresolvedConflicts: true, upstreamStatus: PUBLISHED_HEAD },
      amendTitle: 'Already pushed translated',
      forceTitle: 'Conflicts translated'
    },
    {
      overrides: { upstreamStatus: PUBLISHED_HEAD },
      amendTitle: 'Already pushed translated',
      forceTitle: 'Changes required translated'
    }
  ])(
    'translates blocking reasons: $amendTitle / $forceTitle',
    ({ overrides, amendTitle, forceTitle }) => {
      const rows = amendRows(overrides)
      expect(rows.amend.title).toBe(amendTitle)
      expect(rows.amendForcePush.title).toBe(forceTitle)
    }
  )
})

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
