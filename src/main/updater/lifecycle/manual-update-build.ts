declare const ORCA_MANUAL_UPDATES_ONLY: boolean

export function isManualUpdateBuild(): boolean {
  return typeof ORCA_MANUAL_UPDATES_ONLY === 'boolean' && ORCA_MANUAL_UPDATES_ONLY
}
