import type { Repo } from '../../../../../shared/repository/repo-types'
import { WORK_PROJECT_PRIORITY_SHIFT } from '../../../../../shared/session-effective-priority'
import { translate } from '@/i18n/i18n'
import { useTranslate, type Translate } from '@/i18n/use-translate'
import { SearchableSetting } from '../section-layout/SearchableSetting'
import { SettingsSwitchRow } from '../form-controls/SettingsFormControls'
import type { SettingsSearchEntry } from '../search/settings-search'
import { searchKeywordTranslator } from '../search/settings-search-keywords'

export function getRepositoryWorkProjectSearchEntry(t: Translate = translate): SettingsSearchEntry {
  const keyword = searchKeywordTranslator(t)
  return {
    title: t('components.RepositoryWorkProjectSection.title', 'Work project'),
    description: t(
      'components.RepositoryWorkProjectSection.description',
      "The Activity Work switch ranks this project's agent sessions {{shift}} above their priority when on and {{shift}} below when off, including desktop banners.",
      { shift: WORK_PROJECT_PRIORITY_SHIFT }
    ),
    keywords: [
      ...keyword('components.RepositoryWorkProjectSection.keywordWork', 'work'),
      ...keyword('components.RepositoryWorkProjectSection.keywordPriority', 'priority')
    ]
  }
}

export function RepositoryWorkProjectSection({
  repo,
  updateRepo,
  forceVisible = false
}: {
  repo: Repo
  updateRepo: (repoId: string, updates: Pick<Repo, 'workProject'>) => void | Promise<boolean>
  forceVisible?: boolean
}): React.JSX.Element {
  const t = useTranslate()
  const entry = getRepositoryWorkProjectSearchEntry(t)
  const workProject = repo.workProject === true
  return (
    <SearchableSetting
      title={entry.title}
      description={entry.description}
      keywords={[repo.displayName, ...(entry.keywords ?? [])]}
      forceVisible={forceVisible}
    >
      <SettingsSwitchRow
        label={entry.title}
        description={entry.description}
        checked={workProject}
        onChange={() => void updateRepo(repo.id, { workProject: !workProject })}
      />
    </SearchableSetting>
  )
}
