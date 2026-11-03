import { z } from 'zod'
import { OptionalFiniteNumber, OptionalString, requiredString } from './rpc-param-primitives'

export const OptionalWorkerLaunchPreference = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => value === value.trim(), 'Surrounding whitespace is invalid')
  .optional()

export const WorkerStartParams = z
  .object({
    task: OptionalString,
    spec: OptionalString,
    taskTitle: OptionalString,
    deps: OptionalString,
    parent: OptionalString,
    on: OptionalString,
    run: OptionalString,
    from: requiredString('Missing --from'),
    worktree: OptionalString,
    name: OptionalString,
    repo: OptionalString,
    baseBranch: OptionalString,
    displayName: OptionalString,
    comment: OptionalString,
    setup: z.enum(['run', 'skip', 'inherit']).optional(),
    terminal: OptionalString,
    agent: OptionalString,
    model: OptionalWorkerLaunchPreference,
    effort: OptionalWorkerLaunchPreference,
    /** A named Claude or Pi launch profile, or `default`; absent inherits the coordinator's. */
    launchProfile: OptionalWorkerLaunchPreference,
    retryOf: OptionalString,
    timeoutMs: OptionalFiniteNumber,
    devMode: z.boolean().optional()
  })
  .superRefine((params, ctx) => {
    // A reused terminal keeps its account, and a remote server resolves profiles from its own settings.
    if (params.launchProfile && (params.terminal || params.on)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['launchProfile'],
        message: '--launch-profile cannot combine with --terminal or --on'
      })
    }
    if (!params.task && !params.spec) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['task'],
        message: 'Missing --task or --spec'
      })
    }
    if (params.task && params.spec) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['spec'],
        message: '--task and --spec are mutually exclusive'
      })
    }
    // spec creates a new Task, so retryOf cannot refer to a prior Dispatch for it.
    if (params.retryOf && params.spec) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['retryOf'],
        message:
          '--retry-of needs --task <task_id> naming the failed Task; --spec creates a new one'
      })
    }
  })
