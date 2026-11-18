import { useCallback } from 'react'
import {
  runAmendAndForcePushFlow,
  type AmendAndForcePushDependencies
} from './amend-and-force-push-flow'

export function useSourceControlAmendAndForcePush({
  handleCommit,
  runRemoteAction,
  operationStore
}: AmendAndForcePushDependencies) {
  const runAmendAndForcePush = useCallback(
    (): Promise<void> =>
      runAmendAndForcePushFlow({ handleCommit, runRemoteAction, operationStore }),
    [handleCommit, runRemoteAction, operationStore]
  )

  return { runAmendAndForcePush }
}

export type SourceControlAmendAndForcePush = ReturnType<typeof useSourceControlAmendAndForcePush>
