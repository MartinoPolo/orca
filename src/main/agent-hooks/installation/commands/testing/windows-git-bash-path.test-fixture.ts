import { resolveGitBashPath } from '../git-bash'

// MSYS rewrites paths and switches, so Windows hook tests also exercise Git Bash.
export function findGitBash(): string {
  if (process.env.KIMI_SHELL_PATH) {
    return process.env.KIMI_SHELL_PATH
  }
  const bash = resolveGitBashPath()
  if (!bash) {
    throw new Error('Git Bash is required for the Windows managed hook tests')
  }
  return bash
}
