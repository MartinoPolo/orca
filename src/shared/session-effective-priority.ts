import type { GlobalSettings } from './settings/global-settings-types'
import type { SessionPriority } from './session-attention'

/** Unprioritized sessions count as P2. */
export const DEFAULT_SESSION_PRIORITY: SessionPriority = 2
/** Effective priority at or above this earns desktop banners and the Activity "High priority" tier. */
export const HIGH_SESSION_PRIORITY = 3
/** How far the Work switch moves work-project sessions above or below their stored priority. */
export const WORK_PROJECT_PRIORITY_SHIFT = 1.5

export function isWorkProjectPriorityRaised(
  settings: Pick<GlobalSettings, 'prioritizeWorkProjects'> | null | undefined
): boolean {
  return settings?.prioritizeWorkProjects !== false
}

/** The Work switch raises work-project sessions when on and lowers them when off; other sessions keep their priority. */
export function workProjectPriorityShift(args: {
  workProject: boolean | undefined
  workProjectPriorityRaised: boolean
}): number {
  if (!args.workProject) {
    return 0
  }
  return args.workProjectPriorityRaised ? WORK_PROJECT_PRIORITY_SHIFT : -WORK_PROJECT_PRIORITY_SHIFT
}

export function resolveEffectiveSessionPriority(args: {
  priority: number | undefined
  workProject: boolean | undefined
  workProjectPriorityRaised: boolean
}): number {
  return (args.priority ?? DEFAULT_SESSION_PRIORITY) + workProjectPriorityShift(args)
}
