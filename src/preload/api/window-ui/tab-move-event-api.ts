import type { TabMoveDirection } from '../../../shared/keybindings/types'

export type TabMovePayload = { direction: TabMoveDirection; sourceId: string }

export type TabMoveEventApi = {
  onMoveTabFromBrowserGuest: (callback: (payload: TabMovePayload) => void) => () => void
}
