// Why: whether HEAD is already on the upstream decides which amend row is live — a local commit is
// amended in place, while a published one must be force-pushed right away so the branch never sits
// diverged with Sync as the suggested action.

import { translate } from '@/i18n/i18n'
import type { DropdownItem } from './source-control-dropdown-item-types'
import type { DropdownActionContext } from './source-control-dropdown-action-context'

export type AmendDropdownItems = {
  amend: DropdownItem
  amendForcePush: DropdownItem
}

type AmendBlockingContext = Pick<
  DropdownActionContext,
  'upstreamLoading' | 'headIsPublished' | 'behind' | 'amendDisabledReason'
>

function checkingBranchStatusReason(): string {
  return translate(
    'auto.components.right.sidebar.source.control.dropdown.amend.items.checkingBranchStatus',
    'Checking branch status…'
  )
}

export function buildAmendDropdownItems(
  ctx: DropdownActionContext,
  inputs: { stagedCount: number; hasMessage: boolean }
): AmendDropdownItems {
  const amendBlockingReason = resolveAmendBlockingReason(ctx)
  const amend: DropdownItem = {
    kind: 'amend',
    label: translate(
      'auto.components.right.sidebar.source.control.dropdown.amend.items.label',
      'Amend Last Commit'
    ),
    title:
      amendBlockingReason ?? describeAmendChange(inputs.stagedCount > 0, inputs.hasMessage, false),
    disabled: ctx.globalBusy || amendBlockingReason !== null
  }

  const amendForcePushBlockingReason = resolveAmendForcePushBlockingReason(ctx)
  const amendForcePush: DropdownItem = {
    kind: 'amend_force_push',
    label: translate(
      'auto.components.right.sidebar.source.control.dropdown.amend.items.forcePushLabel',
      'Amend & Force Push'
    ),
    title:
      amendForcePushBlockingReason ??
      describeAmendChange(inputs.stagedCount > 0, inputs.hasMessage, true),
    disabled: ctx.globalBusy || amendForcePushBlockingReason !== null
  }

  return { amend, amendForcePush }
}

function resolveAmendBlockingReason(ctx: AmendBlockingContext): string | null {
  if (ctx.upstreamLoading) {
    return checkingBranchStatusReason()
  }
  if (ctx.headIsPublished) {
    return translate(
      'auto.components.right.sidebar.source.control.dropdown.amend.items.alreadyPushed',
      'Last commit is already pushed — use Amend & Force Push'
    )
  }
  return ctx.amendDisabledReason
}

function resolveAmendForcePushBlockingReason(ctx: AmendBlockingContext): string | null {
  if (ctx.upstreamLoading) {
    return checkingBranchStatusReason()
  }
  if (!ctx.headIsPublished) {
    return translate(
      'auto.components.right.sidebar.source.control.dropdown.amend.items.notPushed',
      'Last commit is not pushed yet — use Amend Last Commit'
    )
  }
  if (ctx.behind > 0) {
    return translate(
      'auto.components.right.sidebar.source.control.dropdown.amend.items.pullFirst',
      'Pull first — the remote has commits newer than your last commit'
    )
  }
  return ctx.amendDisabledReason
}

function describeAmendChange(
  hasStagedChanges: boolean,
  hasMessage: boolean,
  forcePush: boolean
): string {
  if (hasStagedChanges && hasMessage) {
    return forcePush
      ? translate(
          'auto.components.right.sidebar.source.control.dropdown.amend.items.forcePushChangesAndMessage',
          'Add staged changes to the last commit and replace its message, then force push with lease'
        )
      : translate(
          'auto.components.right.sidebar.source.control.dropdown.amend.items.changesAndMessage',
          'Add staged changes to the last commit and replace its message'
        )
  }
  if (hasStagedChanges) {
    return forcePush
      ? translate(
          'auto.components.right.sidebar.source.control.dropdown.amend.items.forcePushChangesOnly',
          'Add staged changes to the last commit, keeping its message, then force push with lease'
        )
      : translate(
          'auto.components.right.sidebar.source.control.dropdown.amend.items.changesOnly',
          'Add staged changes to the last commit, keeping its message'
        )
  }
  return forcePush
    ? translate(
        'auto.components.right.sidebar.source.control.dropdown.amend.items.forcePushMessageOnly',
        'Replace the last commit message, then force push with lease'
      )
    : translate(
        'auto.components.right.sidebar.source.control.dropdown.amend.items.messageOnly',
        'Replace the last commit message'
      )
}
