import type { Repo } from '../../../../../shared/repository/repo-types'
import type { RepositoryPaneRepoUpdate } from './repository-pane-repo-update'
import { RepositoryAgentTrustSection } from './RepositoryAgentTrustSection'
import { RepositoryBrowserProfileSection } from './RepositoryBrowserProfileSection'
import { RepositoryWorkProjectSection } from './RepositoryWorkProjectSection'

/** Per-project preferences for agents, browser tabs and Activity priority. */
export function RepositoryProjectPreferenceSections({
  repo,
  updateRepo,
  forceVisible
}: {
  repo: Repo
  updateRepo: (repoId: string, updates: RepositoryPaneRepoUpdate) => void | Promise<boolean>
  forceVisible: boolean
}): React.JSX.Element {
  return (
    <>
      <RepositoryAgentTrustSection
        repo={repo}
        updateRepo={updateRepo}
        forceVisible={forceVisible}
      />
      <RepositoryBrowserProfileSection
        repo={repo}
        updateRepo={updateRepo}
        forceVisible={forceVisible}
      />
      <RepositoryWorkProjectSection
        repo={repo}
        updateRepo={updateRepo}
        forceVisible={forceVisible}
      />
    </>
  )
}
