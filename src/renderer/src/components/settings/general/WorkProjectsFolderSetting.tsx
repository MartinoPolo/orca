import { useId, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import type { GlobalSettings } from '../../../../../shared/settings/global-settings-types'
import { translate } from '@/i18n/i18n'
import { useTranslate, type Translate } from '@/i18n/use-translate'
import { isImeCompositionKeyDown } from '@/lib/text-input/ime/ime-composition-keyboard-event'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Label } from '../../ui/label'
import { SearchableSetting } from '../section-layout/SearchableSetting'
import type { SettingsSearchEntry } from '../search/settings-search'
import { searchKeywordTranslator } from '../search/settings-search-keywords'

export function getWorkProjectsFolderSearchEntry(t: Translate = translate): SettingsSearchEntry {
  const keyword = searchKeywordTranslator(t)
  return {
    title: t('settings.general.workProjectsFolder.title', 'Work folder'),
    description: t(
      'settings.general.workProjectsFolder.description',
      'Local projects added from inside this folder start as work projects. Leave empty to mark none.'
    ),
    keywords: [
      ...keyword('settings.general.workProjectsFolder.keywordWork', 'work project'),
      ...keyword('settings.general.workProjectsFolder.keywordPriority', 'priority')
    ]
  }
}

export function WorkProjectsFolderSetting({
  settings,
  updateSettings
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}): React.JSX.Element {
  const t = useTranslate()
  const inputId = useId()
  const entry = getWorkProjectsFolderSearchEntry(t)
  const savedFolder = settings.workProjectsFolder ?? ''
  const [draftFolder, setDraftFolder] = useState(savedFolder)
  const [draftBaseFolder, setDraftBaseFolder] = useState(savedFolder)
  // Restart the draft when the saved folder changes elsewhere (another window or a picked folder).
  if (draftBaseFolder !== savedFolder) {
    setDraftBaseFolder(savedFolder)
    setDraftFolder(savedFolder)
  }

  const commitFolder = (folder: string): void => {
    const nextFolder = folder.trim()
    setDraftFolder(nextFolder)
    if (nextFolder !== savedFolder) {
      updateSettings({ workProjectsFolder: nextFolder })
    }
  }

  const handleBrowse = async (): Promise<void> => {
    const pickedFolder = await window.api.shell.pickDirectory({})
    if (pickedFolder) {
      commitFolder(pickedFolder)
    }
  }

  return (
    <SearchableSetting
      title={entry.title}
      description={entry.description}
      keywords={entry.keywords}
      className="space-y-2 py-3"
    >
      <Label htmlFor={inputId}>{entry.title}</Label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={draftFolder}
          onChange={(event) => setDraftFolder(event.target.value)}
          onBlur={() => commitFolder(draftFolder)}
          onKeyDown={(event) => {
            if (isImeCompositionKeyDown(event)) {
              return
            }
            if (event.key === 'Enter') {
              event.currentTarget.blur()
            }
            if (event.key === 'Escape') {
              setDraftFolder(savedFolder)
            }
          }}
          className="flex-1"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleBrowse()}
          className="shrink-0"
        >
          <FolderOpen className="size-3.5" />
          {t('auto.components.settings.GeneralWorkspaceSettingsSection.5567191a6e', 'Browse')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{entry.description}</p>
    </SearchableSetting>
  )
}
