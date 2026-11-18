import type { AppChromeLayout } from '../../app-shell/chrome/use-app-chrome-layout'
import type { FloatingWorkspacePanelState } from '../../components/floating-terminal/workspace/use-floating-workspace-panel'

export type GlobalKeybindingsLayout = Pick<
  AppChromeLayout,
  'activeView' | 'creationLayoutActive' | 'workspaceChromeActive'
>
export type GlobalKeybindingsFloatingWorkspace = Pick<
  FloatingWorkspacePanelState,
  'enabled' | 'open' | 'visibleTabCount' | 'openMaximized' | 'setOpenWithFocus'
>
