import { fileLinkOpensInSystemApp } from '../../../../shared/file-link-system-app-kinds'
import { useAppStore } from '@/store'

/** Shift+modifier takes whichever destination the file kind does not open by default. */
export function fileLinkDirectClickOpensSystemApp(filePath: string, shiftKey: boolean): boolean {
  return shiftKey !== fileLinkOpensInSystemApp(useAppStore.getState().settings, filePath)
}
