export type WorkProjectSettings = {
  /** Activity Work switch: work-project sessions rank `WORK_PROJECT_PRIORITY_SHIFT` above their stored priority when on and below it when off; absent means on. */
  prioritizeWorkProjects?: boolean
  /** Local folder whose newly added repositories start as work projects; empty or absent marks none. */
  workProjectsFolder?: string
}
