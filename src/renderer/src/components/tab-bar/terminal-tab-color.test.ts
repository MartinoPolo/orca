import { describe, expect, it } from 'vitest'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import { resolveTerminalTabColor } from './terminal-tab-color'

const expectedColor = {
  claude: '#f97316',
  pi: '#3b82f6',
  piw: '#a855f7',
  command: '#14b8a6',
  manual: '#22c55e'
}

const tab: TerminalTab = {
  id: 'tab',
  ptyId: null,
  worktreeId: 'worktree',
  title: 'Terminal 1',
  customTitle: null,
  color: null,
  sortOrder: 0,
  createdAt: 0
}

describe('terminal tab automatic color', () => {
  it('leaves ordinary terminals neutral and colors command launches teal', () => {
    expect(resolveTerminalTabColor(tab, null)).toBeNull()
    expect(resolveTerminalTabColor({ ...tab, launchKind: 'command' }, null)).toBe(
      expectedColor.command
    )
  })
  it('uses agent identity before command provenance and distinguishes a named Piw launch', () => {
    expect(resolveTerminalTabColor(tab, 'claude')).toBe(expectedColor.claude)
    expect(resolveTerminalTabColor(tab, 'pi')).toBe(expectedColor.pi)
    expect(resolveTerminalTabColor({ ...tab, launchKind: 'piw' }, 'pi')).toBe(expectedColor.piw)
    expect(resolveTerminalTabColor({ ...tab, launchKind: 'piw' }, null)).toBe(expectedColor.piw)
    expect(resolveTerminalTabColor({ ...tab, launchKind: 'command' }, 'pi')).toBe(expectedColor.pi)
    expect(resolveTerminalTabColor({ ...tab, launchKind: 'command' }, 'codex')).toBeNull()
    expect(resolveTerminalTabColor({ ...tab, quickCommandLabel: 'Agent prompt' }, null)).toBeNull()
  })
  it('keeps explicit manual color and explicit neutral over automatic identity', () => {
    expect(resolveTerminalTabColor({ ...tab, color: expectedColor.manual }, 'claude')).toBe(
      expectedColor.manual
    )
    expect(resolveTerminalTabColor({ ...tab, color: '' }, 'claude')).toBeNull()
  })
})
