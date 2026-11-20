import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../execution-host/execution-host'
import { isPathInsideOrEqual } from '../file-access/cross-platform-path'
import type { Repo } from './repo-types'

/** The work folder is a local path, so only local repositories can sit inside it. */
export function isRepoInsideWorkProjectsFolder(
  repo: Pick<Repo, 'path' | 'connectionId' | 'executionHostId'>,
  workProjectsFolder: string | undefined
): boolean {
  const folder = typeof workProjectsFolder === 'string' ? workProjectsFolder.trim() : ''
  if (!folder || getRepoExecutionHostId(repo) !== LOCAL_EXECUTION_HOST_ID) {
    return false
  }
  return isPathInsideOrEqual(folder, repo.path)
}
