import { floatingWorkspacePanelClaimsChord } from '@/lib/plugins/commands/plugin-command-keybindings'
import {
  TAB_MOVE_ACTION_IDS,
  type KeybindingActionId,
  type KeybindingMatchOptions,
  type KeybindingOverrides
} from '../../../../shared/keybindings/types'
import { shortcutPlatform } from '../../app-shell/chrome/app-window-chrome'
import type { ShortcutDispatchInput } from '../../lib/app-commands/app-command-handlers'

/** A bound tab move also runs from editable and floating-terminal targets; floating-panel chords still win. */
export function dispatchTabMoveShortcut(
  input: ShortcutDispatchInput,
  keybindings: KeybindingOverrides | undefined,
  matchOptions: KeybindingMatchOptions,
  matchShortcut: (actionId: KeybindingActionId) => boolean,
  handlers: ReadonlyMap<KeybindingActionId, () => boolean>
): boolean {
  return TAB_MOVE_ACTION_IDS.some(
    (actionId) =>
      matchShortcut(actionId) &&
      !floatingWorkspacePanelClaimsChord(input, shortcutPlatform, keybindings, matchOptions) &&
      handlers.get(actionId)?.() === true
  )
}
