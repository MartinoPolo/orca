import { resolveGitBashPath } from '../git-bash'

// Why: Windows hook tests must run the registered command through MSYS too — it
// rewrites switches and paths, so a launcher can pass under cmd.exe and fail here.
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
