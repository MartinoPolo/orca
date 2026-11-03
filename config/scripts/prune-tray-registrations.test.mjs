import { expect, it } from 'vitest'
import {
  parseTrayRegistrations,
  selectStaleOrcaRegistrations
} from './prune-tray-registrations.mjs'

const registryQueryOutput = [
  '',
  'HKEY_CURRENT_USER\\Control Panel\\NotifyIconSettings\\1',
  '    ExecutablePath    REG_SZ    C:\\Users\\me\\AppData\\Local\\Programs\\orca\\Orca.exe',
  '',
  'HKEY_CURRENT_USER\\Control Panel\\NotifyIconSettings\\2',
  '    ExecutablePath    REG_SZ    C:\\apps\\Orca-Stable\\builds\\old\\win-unpacked\\Orca.exe',
  '',
  'HKEY_CURRENT_USER\\Control Panel\\NotifyIconSettings\\3',
  '    ExecutablePath    REG_SZ    C:\\Program Files\\Other\\other.exe',
  '',
  'End of search: 3 match(es) found.',
  ''
].join('\r\n')

it('selects Orca registrations outside the kept executables', () => {
  const stale = selectStaleOrcaRegistrations(parseTrayRegistrations(registryQueryOutput), [
    'c:\\users\\me\\appdata\\local\\programs\\orca\\orca.exe'
  ])
  expect(stale).toEqual([
    {
      key: 'HKEY_CURRENT_USER\\Control Panel\\NotifyIconSettings\\2',
      executablePath: 'C:\\apps\\Orca-Stable\\builds\\old\\win-unpacked\\Orca.exe'
    }
  ])
})
