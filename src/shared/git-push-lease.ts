import type { GitCommandRunner } from './git-effective-upstream'
import { assertValidGitPushTarget } from './git-push-target-validation'
import { resolveConfiguredGitPushTarget } from './git-push-target-resolution'
import type { GitPushTarget } from './worktree/types'

export type GitPushLease = { expectedHead: string; pushTarget: GitPushTarget }

export function parseGitPushLease(value: unknown): GitPushLease | undefined {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('expectedHead' in value) ||
    typeof value.expectedHead !== 'string' ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value.expectedHead) ||
    !('pushTarget' in value)
  ) {
    return undefined
  }
  try {
    assertValidGitPushTarget(value.pushTarget)
    return {
      expectedHead: value.expectedHead,
      pushTarget: {
        remoteName: value.pushTarget.remoteName,
        branchName: value.pushTarget.branchName
      }
    }
  } catch {
    return undefined
  }
}

export function requireGitPushLease(value: unknown): GitPushLease {
  const lease = parseGitPushLease(value)
  if (!lease) {
    throw new Error('A valid pre-amend push lease is required')
  }
  return lease
}

export function buildGitLeasePushArgs(lease: GitPushLease): string[] {
  const { expectedHead, pushTarget } = requireGitPushLease(lease)
  const destinationRef = `refs/heads/${pushTarget.branchName}`
  return [
    'push',
    `--force-with-lease=${destinationRef}:${expectedHead}`,
    '--set-upstream',
    pushTarget.remoteName,
    `HEAD:${destinationRef}`
  ]
}

export async function captureGitAmendPushLease(
  runGit: GitCommandRunner,
  explicitTarget?: GitPushTarget
): Promise<GitPushLease | undefined> {
  try {
    // The expected OID is HEAD before amendment, never a tracking ref refreshed during hooks.
    const { stdout: head } = await runGit(['rev-parse', '--verify', 'HEAD'])
    let pushTarget = explicitTarget
    if (!pushTarget) {
      const configured = await resolveConfiguredGitPushTarget(runGit)
      if (configured) {
        pushTarget = {
          remoteName: configured.remote,
          branchName: configured.refspec.slice('HEAD:'.length)
        }
      } else {
        const { stdout: branch } = await runGit(['symbolic-ref', '--quiet', '--short', 'HEAD'])
        pushTarget = { remoteName: 'origin', branchName: branch.trim() }
      }
    }
    assertValidGitPushTarget(pushTarget)
    await runGit(['check-ref-format', '--branch', pushTarget.branchName])
    const { stdout: publishedHead } = await runGit([
      'rev-parse',
      '--verify',
      `refs/remotes/${pushTarget.remoteName}/${pushTarget.branchName}`
    ])
    if (publishedHead.trim() !== head.trim()) {
      return undefined
    }
    return parseGitPushLease({ expectedHead: head.trim(), pushTarget })
  } catch {
    // A normal local amend does not require a published upstream.
    return undefined
  }
}
