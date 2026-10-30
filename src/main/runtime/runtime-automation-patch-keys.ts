/** Update fields a runtime patch copies verbatim; target selectors are resolved separately. */
export const RUNTIME_AUTOMATION_PATCH_KEYS = [
  'name',
  'prompt',
  'precheck',
  'agentId',
  'extraAgentArgs',
  'agentProfileId',
  'runContext',
  'sourceContext',
  'baseBranch',
  'setupDecision',
  'reuseSession',
  'timezone',
  'rrule',
  'dtstart',
  'enabled',
  'missedRunGraceMinutes'
] as const
