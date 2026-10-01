// Why: whether HEAD is already on the upstream decides which amend row is live — a local commit is
// amended in place, while a published one must be force-pushed right away so the branch never sits
// diverged with Sync as the suggested action.

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

const CHECKING_BRANCH_STATUS_REASON = 'Checking branch status…'

export function buildAmendDropdownItems(
  ctx: DropdownActionContext,
  inputs: { stagedCount: number; hasMessage: boolean }
): AmendDropdownItems {
  const amendChangeDescription = describeAmendChange(inputs.stagedCount > 0, inputs.hasMessage)

  const amendBlockingReason = resolveAmendBlockingReason(ctx)
  const amend: DropdownItem = {
    kind: 'amend',
    label: 'Amend Last Commit',
    title: amendBlockingReason ?? amendChangeDescription,
    disabled: ctx.globalBusy || amendBlockingReason !== null
  }

  const amendForcePushBlockingReason = resolveAmendForcePushBlockingReason(ctx)
  const amendForcePush: DropdownItem = {
    kind: 'amend_force_push',
    label: 'Amend & Force Push',
    title: amendForcePushBlockingReason ?? `${amendChangeDescription}, then force push with lease`,
    disabled: ctx.globalBusy || amendForcePushBlockingReason !== null
  }

  return { amend, amendForcePush }
}

function resolveAmendBlockingReason(ctx: AmendBlockingContext): string | null {
  if (ctx.upstreamLoading) {
    return CHECKING_BRANCH_STATUS_REASON
  }
  if (ctx.headIsPublished) {
    return 'Last commit is already pushed — use Amend & Force Push'
  }
  return ctx.amendDisabledReason
}

function resolveAmendForcePushBlockingReason(ctx: AmendBlockingContext): string | null {
  if (ctx.upstreamLoading) {
    return CHECKING_BRANCH_STATUS_REASON
  }
  if (!ctx.headIsPublished) {
    return 'Last commit is not pushed yet — use Amend Last Commit'
  }
  if (ctx.behind > 0) {
    return 'Pull first — the remote has commits newer than your last commit'
  }
  return ctx.amendDisabledReason
}

function describeAmendChange(hasStagedChanges: boolean, hasMessage: boolean): string {
  if (hasStagedChanges && hasMessage) {
    return 'Add staged changes to the last commit and replace its message'
  }
  if (hasStagedChanges) {
    return 'Add staged changes to the last commit, keeping its message'
  }
  return 'Replace the last commit message'
}
