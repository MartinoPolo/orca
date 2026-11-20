import type { useAppStore } from '../store/index'
import {
  isWorkProjectPriorityRaised,
  resolveEffectiveSessionPriority
} from '../../../shared/session-effective-priority'
import { findNotificationWorkspaceRepo } from './notification-workspace-labels'

/** Banner priority: the stored session priority shifted by the Work switch when the workspace belongs to a work project. */
export function resolveNotificationEffectivePriority(
  state: ReturnType<typeof useAppStore.getState>,
  workspaceId: string,
  storedPriority: number
): number {
  return resolveEffectiveSessionPriority({
    priority: storedPriority,
    workProject: findNotificationWorkspaceRepo(state, workspaceId)?.workProject,
    workProjectPriorityRaised: isWorkProjectPriorityRaised(state.settings)
  })
}
