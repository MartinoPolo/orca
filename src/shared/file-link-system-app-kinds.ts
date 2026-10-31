import { hasBinaryFileExtension } from './binary-file-extensions'
import { filePreviewForPath } from './file-preview-kind'

export const FILE_LINK_SYSTEM_APP_KINDS = ['image', 'pdf', 'media', 'binary'] as const

export type FileLinkSystemAppKind = (typeof FILE_LINK_SYSTEM_APP_KINDS)[number]

export type FileLinkOpenSettings = {
  /** File-link kinds whose default open uses the OS app; Shift+modifier opens them in Orca instead. */
  fileLinkSystemAppKinds?: FileLinkSystemAppKind[]
}

/** Null is text: it always opens in Orca's editor, and HTML keeps its link-routing browser. */
export function fileLinkSystemAppKindForPath(filePath: string): FileLinkSystemAppKind | null {
  const preview = filePreviewForPath(filePath)
  if (preview) {
    return preview.kind === 'audio' || preview.kind === 'video' ? 'media' : preview.kind
  }
  return hasBinaryFileExtension(filePath) ? 'binary' : null
}

/** Absent settings predate the choice and open every non-text kind with the default app. */
export function fileLinkOpensInSystemApp(
  settings: FileLinkOpenSettings | null | undefined,
  filePath: string
): boolean {
  const kind = fileLinkSystemAppKindForPath(filePath)
  return (
    kind !== null && (settings?.fileLinkSystemAppKinds ?? FILE_LINK_SYSTEM_APP_KINDS).includes(kind)
  )
}
