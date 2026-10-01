import { useCallback } from 'react'
import {
  runAmendAndForcePushFlow,
  type AmendAndForcePushDependencies
} from './amend-and-force-push-flow'

export function useSourceControlAmendAndForcePush({
  activeWorktreeId,
  handleCommit,
  runRemoteAction,
  setRemoteActionErrors
}: AmendAndForcePushDependencies) {
  const runAmendAndForcePush = useCallback(
    (): Promise<void> =>
      runAmendAndForcePushFlow({
        activeWorktreeId,
        handleCommit,
        runRemoteAction,
        setRemoteActionErrors
      }),
    [activeWorktreeId, handleCommit, runRemoteAction, setRemoteActionErrors]
  )

  return { runAmendAndForcePush }
}

export type SourceControlAmendAndForcePush = ReturnType<typeof useSourceControlAmendAndForcePush>
