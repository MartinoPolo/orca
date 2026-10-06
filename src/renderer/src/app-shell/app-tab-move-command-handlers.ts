import { moveActiveTabInDirection } from '../components/tab-bar/tab-move-to-pane-column'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import { TAB_MOVE_ACTIONS, type KeybindingActionId } from '../../../shared/keybindings'

type TabMoveCommandContext = {
  activeWorktreeId: string | null
  floatingWorkspaceFocused: boolean
  workspaceChromeActive: boolean
  claim: (actionId: KeybindingActionId, run: () => void) => boolean
}

/** Handlers that move the active tab of the focused workspace (floating or main) toward a neighbor. */
export function createTabMoveCommandHandlers({
  activeWorktreeId,
  floatingWorkspaceFocused,
  workspaceChromeActive,
  claim
}: TabMoveCommandContext): (readonly [KeybindingActionId, () => boolean])[] {
  const worktreeId = floatingWorkspaceFocused
    ? FLOATING_TERMINAL_WORKTREE_ID
    : workspaceChromeActive
      ? activeWorktreeId
      : null
  return TAB_MOVE_ACTIONS.map(
    ({ actionId, direction }) =>
      [
        actionId,
        () => {
          if (!worktreeId || !moveActiveTabInDirection(worktreeId, direction)) {
            return false
          }
          return claim(actionId, () => {})
        }
      ] as const
  )
}
