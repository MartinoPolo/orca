import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import {
  cleanupGoldenWorktree,
  createGoldenWorktree,
  GOLDEN_CHANGED_PATH,
  type GoldenWorktree,
  openGoldenSourceControl,
  seedGoldenSourceEdit
} from './helpers/golden-source-control'
import { waitForSessionReady } from './helpers/store'

const AMENDED_LINE = 'export const amended = true'
const BASE_COMMIT_MESSAGE = 'feat: amend base'

type RegisterCleanup = (cleanup: () => Promise<void>) => void

function readGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function createCommittedAmendFixture(
  testRepoPath: string,
  label: string,
  registerCleanup: RegisterCleanup
): GoldenWorktree {
  const fixture = createGoldenWorktree(testRepoPath, label)
  registerCleanup(async () => cleanupGoldenWorktree(testRepoPath, fixture))
  seedGoldenSourceEdit(fixture.worktreePath)
  execFileSync('git', ['commit', '-am', BASE_COMMIT_MESSAGE], {
    cwd: fixture.worktreePath,
    stdio: 'pipe'
  })
  return fixture
}

function stageAmendedLine(worktreePath: string): void {
  const changedPath = path.join(worktreePath, GOLDEN_CHANGED_PATH)
  writeFileSync(changedPath, `${readFileSync(changedPath, 'utf8')}\n${AMENDED_LINE}\n`)
  execFileSync('git', ['add', GOLDEN_CHANGED_PATH], { cwd: worktreePath, stdio: 'pipe' })
}

/** Publishes the fixture branch to a throwaway bare remote and returns that remote's path. */
function publishToBareRemote(
  testRepoPath: string,
  fixture: GoldenWorktree,
  registerCleanup: RegisterCleanup
): string {
  const remoteRoot = mkdtempSync(path.join(os.tmpdir(), 'orca-e2e-amend-remote-'))
  const remotePath = path.join(remoteRoot, 'origin.git')
  // Why: the seeded repo's config is shared by every worktree and worker, so use a unique remote name.
  const remoteName = `${fixture.branchName}-remote`
  registerCleanup(async () => {
    if (readGit(testRepoPath, ['remote']).split('\n').includes(remoteName)) {
      execFileSync('git', ['remote', 'remove', remoteName], { cwd: testRepoPath, stdio: 'pipe' })
    }
    rmSync(remoteRoot, { recursive: true, force: true })
  })
  execFileSync('git', ['init', '--bare', remotePath], { stdio: 'pipe' })
  execFileSync('git', ['remote', 'add', remoteName, remotePath], {
    cwd: fixture.worktreePath,
    stdio: 'pipe'
  })
  execFileSync('git', ['push', '-u', remoteName, fixture.branchName], {
    cwd: fixture.worktreePath,
    stdio: 'pipe'
  })
  return remotePath
}

function readRemoteBranchHead(worktreePath: string, remotePath: string, branch: string): string {
  return readGit(worktreePath, ['ls-remote', remotePath, `refs/heads/${branch}`]).split('\t')[0]
}

async function openSourceControlWithStagedChange(
  page: Page,
  testRepoPath: string,
  fixture: GoldenWorktree
): Promise<void> {
  await waitForSessionReady(page)
  await openGoldenSourceControl(page, testRepoPath, fixture)
  await expect(
    page
      .locator('[data-testid="source-control-entry"][data-source-control-area="staged"]')
      .filter({ hasText: path.basename(GOLDEN_CHANGED_PATH) })
  ).toBeVisible({ timeout: 10_000 })
}

async function openCommitActionsMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'More commit and remote actions' }).click()
  await expect(page.getByRole('menuitem', { name: 'Amend Last Commit' })).toBeVisible()
}

test('amends the last local commit from the Source Control menu', async ({
  orcaPage,
  testRepoPath,
  registerPostElectronShutdownCleanup
}) => {
  const fixture = createCommittedAmendFixture(
    testRepoPath,
    'amend',
    registerPostElectronShutdownCleanup
  )
  const worktreePath = fixture.worktreePath
  const commitCount = readGit(worktreePath, ['rev-list', '--count', 'HEAD'])
  stageAmendedLine(worktreePath)

  await openSourceControlWithStagedChange(orcaPage, testRepoPath, fixture)
  await openCommitActionsMenu(orcaPage)
  const amendItem = orcaPage.getByRole('menuitem', { name: 'Amend Last Commit' })
  await expect(amendItem).not.toHaveAttribute('data-disabled', { timeout: 10_000 })
  await expect(orcaPage.getByRole('menuitem', { name: 'Amend & Force Push' })).toHaveAttribute(
    'data-disabled'
  )
  await orcaPage.screenshot({ path: test.info().outputPath('amend-menu.png') })
  await amendItem.click()

  await expect
    .poll(() => readGit(worktreePath, ['status', '--porcelain']), { timeout: 20_000 })
    .toBe('')
  expect(readGit(worktreePath, ['rev-list', '--count', 'HEAD'])).toBe(commitCount)
  expect(readGit(worktreePath, ['log', '-1', '--format=%s'])).toBe(BASE_COMMIT_MESSAGE)
  expect(readGit(worktreePath, ['show', `HEAD:${GOLDEN_CHANGED_PATH}`])).toContain(AMENDED_LINE)

  await orcaPage.getByRole('textbox', { name: 'Commit message' }).fill('feat: amend reworded')
  await openCommitActionsMenu(orcaPage)
  await expect(amendItem).not.toHaveAttribute('data-disabled', { timeout: 10_000 })
  await amendItem.click()

  await expect
    .poll(() => readGit(worktreePath, ['log', '-1', '--format=%s']), { timeout: 20_000 })
    .toBe('feat: amend reworded')
  expect(readGit(worktreePath, ['rev-list', '--count', 'HEAD'])).toBe(commitCount)
})

test('amends a published commit and force-pushes it from the Source Control menu', async ({
  orcaPage,
  testRepoPath,
  registerPostElectronShutdownCleanup
}) => {
  const fixture = createCommittedAmendFixture(
    testRepoPath,
    'amend-published',
    registerPostElectronShutdownCleanup
  )
  const worktreePath = fixture.worktreePath
  const remotePath = publishToBareRemote(testRepoPath, fixture, registerPostElectronShutdownCleanup)
  const publishedHead = readGit(worktreePath, ['rev-parse', 'HEAD'])
  const commitCount = readGit(worktreePath, ['rev-list', '--count', 'HEAD'])
  stageAmendedLine(worktreePath)

  await openSourceControlWithStagedChange(orcaPage, testRepoPath, fixture)
  await openCommitActionsMenu(orcaPage)
  const amendForcePushItem = orcaPage.getByRole('menuitem', { name: 'Amend & Force Push' })
  // Why: both rows stay disabled while upstream status loads, so wait for the enabled row first.
  await expect(amendForcePushItem).not.toHaveAttribute('data-disabled', { timeout: 10_000 })
  await expect(orcaPage.getByRole('menuitem', { name: 'Amend Last Commit' })).toHaveAttribute(
    'data-disabled'
  )
  await orcaPage.screenshot({ path: test.info().outputPath('amend-force-push-menu.png') })
  await amendForcePushItem.click()

  // Why: the push lands only after the local amend, so a moved remote head means both finished.
  await expect
    .poll(() => readRemoteBranchHead(worktreePath, remotePath, fixture.branchName), {
      timeout: 20_000
    })
    .not.toBe(publishedHead)
  expect(readRemoteBranchHead(worktreePath, remotePath, fixture.branchName)).toBe(
    readGit(worktreePath, ['rev-parse', 'HEAD'])
  )
  expect(readGit(worktreePath, ['rev-list', '--count', 'HEAD'])).toBe(commitCount)
  expect(readGit(worktreePath, ['log', '-1', '--format=%s'])).toBe(BASE_COMMIT_MESSAGE)
  expect(readGit(worktreePath, ['show', `HEAD:${GOLDEN_CHANGED_PATH}`])).toContain(AMENDED_LINE)
})
