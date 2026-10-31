import type { GlobalSettings } from '../../../../../../shared/global-settings-types'
import {
  FILE_LINK_SYSTEM_APP_KINDS,
  type FileLinkSystemAppKind
} from '../../../../../../shared/file-link-system-app-kinds'
import { translate } from '@/i18n/i18n'
import { SettingsRow, SettingsSegmentedControl } from '../../form-controls/SettingsFormControls'
import { SettingsGroupSubsection } from '../../section-layout/SettingsGroup'

type FileLinkTarget = 'orca' | 'system'

type BrowserFileLinkTargetRowsProps = {
  settings: Pick<GlobalSettings, 'fileLinkSystemAppKinds'>
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

function fileLinkKindLabel(kind: FileLinkSystemAppKind): string {
  const labels = {
    image: translate('auto.components.settings.BrowserFileLinkTargetRows.imageLabel', 'Images'),
    pdf: translate('auto.components.settings.BrowserFileLinkTargetRows.pdfLabel', 'PDFs'),
    media: translate(
      'auto.components.settings.BrowserFileLinkTargetRows.mediaLabel',
      'Audio and video'
    ),
    binary: translate(
      'auto.components.settings.BrowserFileLinkTargetRows.binaryLabel',
      'Other binary files'
    )
  } satisfies Record<FileLinkSystemAppKind, string>
  return labels[kind]
}

export function BrowserFileLinkTargetRows({
  settings,
  updateSettings
}: BrowserFileLinkTargetRowsProps): React.JSX.Element {
  const systemAppKinds = settings.fileLinkSystemAppKinds ?? FILE_LINK_SYSTEM_APP_KINDS
  const title = translate('auto.components.settings.BrowserFileLinkTargetRows.title', 'File links')
  const description = translate(
    'auto.components.settings.BrowserFileLinkTargetRows.description',
    'Where clicked file paths open by kind. Text files always open in Orca; Shift+Cmd/Ctrl-click opens the other destination.'
  )
  const orcaLabel = translate(
    'auto.components.settings.BrowserFileLinkTargetRows.orcaLabel',
    'Orca'
  )
  const systemLabel = translate(
    'auto.components.settings.BrowserFileLinkTargetRows.systemLabel',
    'Default app'
  )
  const setTarget = (kind: FileLinkSystemAppKind, target: FileLinkTarget): void => {
    updateSettings({
      fileLinkSystemAppKinds: FILE_LINK_SYSTEM_APP_KINDS.filter((candidate) =>
        candidate === kind ? target === 'system' : systemAppKinds.includes(candidate)
      )
    })
  }

  return (
    <SettingsGroupSubsection title={title} description={description}>
      {FILE_LINK_SYSTEM_APP_KINDS.map((kind) => (
        <SettingsRow
          key={kind}
          label={fileLinkKindLabel(kind)}
          control={
            <SettingsSegmentedControl<FileLinkTarget>
              value={systemAppKinds.includes(kind) ? 'system' : 'orca'}
              onChange={(target) => setTarget(kind, target)}
              ariaLabel={fileLinkKindLabel(kind)}
              size="sm"
              options={[
                { value: 'orca', label: orcaLabel },
                { value: 'system', label: systemLabel }
              ]}
            />
          }
        />
      ))}
    </SettingsGroupSubsection>
  )
}
