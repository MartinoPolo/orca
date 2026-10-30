import { TAB_MOVE_ACTIONS, type TabMoveDirection } from '../shared/keybindings'
import type { TabMovePayload } from './api/ui-command-event-api'

function isTabMoveDirection(value: unknown): value is TabMoveDirection {
  return TAB_MOVE_ACTIONS.some(({ direction }) => direction === value)
}

export function admitTabMovePayload(value: unknown): TabMovePayload | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('direction' in value) ||
    !('sourceId' in value) ||
    !isTabMoveDirection(value.direction) ||
    typeof value.sourceId !== 'string' ||
    value.sourceId === ''
  ) {
    return null
  }
  return { direction: value.direction, sourceId: value.sourceId }
}
