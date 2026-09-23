import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WslTranscriptFsError } from '../../../native-chat/transcript-filesystem/wsl-transcript-fs-error'

let failNextChatsReaddir = false
let failNextChatsRootReaddir = false
let failMetaJsonReads = false
let failMetaJsonStats: false | true | 'eacces' = false
let cancelMetaJsonReads: AbortController | null = null
let chatsRootReads = 0
let workspaceReads = 0
vi.mock(
  '../../../native-chat/transcript-filesystem/wsl-transcript-fs-access',
  async (importOriginal) => {
    const actual = await importOriginal<typeof WslTranscriptFsAccess>()
    return {
      ...actual,
      wslGatedReaddir: (
        ...args: Parameters<typeof actual.wslGatedReaddir>
      ): ReturnType<typeof actual.wslGatedReaddir> => {
        if (args[0].endsWith('chats')) {
          chatsRootReads += 1
          if (failNextChatsRootReaddir) {
            failNextChatsRootReaddir = false
            return Promise.reject(new WslTranscriptFsError('timeout', 'wsl fs timed out'))
          }
        }
        if (args[0].includes('workspace-hash') || args[0].includes('other-workspace')) {
          workspaceReads += 1
        }
        if (failNextChatsReaddir && args[0].includes('workspace-hash')) {
          failNextChatsReaddir = false
          return Promise.reject(new WslTranscriptFsError('timeout', 'wsl fs timed out'))
        }
        return actual.wslGatedReaddir(...args)
      },
      wslGatedReadFile: (
        ...args: Parameters<typeof actual.wslGatedReadFile>
      ): ReturnType<typeof actual.wslGatedReadFile> => {
        if (failMetaJsonReads && String(args[0]).endsWith('meta.json')) {
          return Promise.reject(new WslTranscriptFsError('timeout', 'wsl fs timed out'))
        }
        if (cancelMetaJsonReads && String(args[0]).endsWith('meta.json')) {
          cancelMetaJsonReads.abort()
          return Promise.reject(new DOMException('This operation was aborted', 'AbortError'))
        }
        return actual.wslGatedReadFile(...args)
      },
      wslGatedStat: (
        ...args: Parameters<typeof actual.wslGatedStat>
      ): ReturnType<typeof actual.wslGatedStat> => {
        if (failMetaJsonStats && String(args[0]).endsWith('meta.json')) {
          return Promise.reject(
            failMetaJsonStats === 'eacces'
              ? Object.assign(new Error('permission denied'), { code: 'EACCES' })
              : new WslTranscriptFsError('timeout', 'wsl fs timed out')
          )
        }
        return actual.wslGatedStat(...args)
      }
    }
  }
)
import type * as WslTranscriptFsAccess from '../../../native-chat/transcript-filesystem/wsl-transcript-fs-access'
import {
  cursorChatMetaPath,
  cursorChatMetaRefusals,
  resetCursorChatMetaIndexCacheForTests,
  withCursorChatMetaScan
} from './session-scanner-cursor-chat-meta'
import {
  isAiVaultScanCancelledError,
  type AiVaultScanIssue,
  type AiVaultSession
} from '../../../../shared/ai-vault/contracts/ai-vault-types'
import { AI_VAULT_AGENT_SOURCES } from '../../discovery/session-scanner-agent-sources'
import { discoverFiles } from '../../discovery/session-scanner-discovery'
import { scanAiVaultSessions } from '../../session-scanner'
import {
  createSessionParseStats,
  parseAgentSessionFileCached,
  type SessionParseStats
} from '../../parse-cache/session-scanner-parse-cache'
import {
  resetSessionParseCacheForTests,
  getSessionParseCacheEntry,
  lookupSessionScopeCwds,
  resolveSessionScopeCwd
} from '../../parse-cache/session-parse-cache-store'

import { isolatedScanRoots } from '../../scanner-fixtures/session-scanner-test-fixtures'
import type { FileWithMtime } from '../../session-scanner-types'

// Mirror Cursor meta.json keys (2026-09).
type CursorMetaFixture = {
  schemaVersion: number
  createdAtMs: number
  updatedAtMs: number
  cwd: string
  hasConversation: boolean
  title?: string
}

const CREATED_AT_MS = 1_787_039_612_017
const UPDATED_AT_MS = 1_787_039_640_532

let tempRoots: string[] = []

afterEach(async () => {
  resetCursorChatMetaIndexCacheForTests()
  resetSessionParseCacheForTests()
  failNextChatsRootReaddir = false
  failNextChatsReaddir = false
  failMetaJsonReads = false
  failMetaJsonStats = false
  cancelMetaJsonReads = null
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })))
  tempRoots = []
})

async function createCursorHome(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'orca-cursor-chat-meta-'))
  tempRoots.push(root)
  const cursorHome = join(root, '.cursor')
  await mkdir(cursorHome, { recursive: true })
  return cursorHome
}

async function writeTranscript(
  cursorHome: string,
  projectSlug: string,
  chatId: string,
  lines: string[]
): Promise<string> {
  const chatDir = join(cursorHome, 'projects', projectSlug, 'agent-transcripts', chatId)
  await mkdir(chatDir, { recursive: true })
  const transcriptPath = join(chatDir, `${chatId}.jsonl`)
  await writeFile(transcriptPath, lines.map((line) => `${line}\n`).join(''))
  return transcriptPath
}

async function writeChatMeta(
  cursorHome: string,
  workspaceHash: string,
  chatId: string,
  meta: Partial<CursorMetaFixture> = {}
): Promise<string> {
  const chatDir = join(cursorHome, 'chats', workspaceHash, chatId)
  await mkdir(chatDir, { recursive: true })
  const metaPath = join(chatDir, 'meta.json')
  await writeFile(
    metaPath,
    JSON.stringify({
      schemaVersion: 1,
      createdAtMs: CREATED_AT_MS,
      updatedAtMs: UPDATED_AT_MS,
      cwd: '/private/tmp/workspace',
      hasConversation: true,
      ...meta
    } satisfies CursorMetaFixture)
  )
  return metaPath
}

describe('cursor chat meta', () => {
  it('re-indexes after a chat appears under an already indexed workspace', async () => {
    const cursorHome = await createCursorHome()
    await writeChatMeta(cursorHome, 'workspace-hash', 'chat-first')
    const workspacePath = join(cursorHome, 'chats', 'workspace-hash')
    // The directory update must be visible even within one filesystem clock tick.
    await utimes(workspacePath, 1, 1)
    const firstTranscript = await writeTranscript(cursorHome, 'slug', 'chat-first', [])
    const workspaceDir = join(cursorHome, 'chats', 'workspace-hash')
    const fixedTime = new Date('2024-01-01T00:00:00.000Z')
    await utimes(workspaceDir, fixedTime, fixedTime)
    expect(await cursorChatMetaPath(firstTranscript)).toBeDefined()

    const laterMetaPath = await writeChatMeta(cursorHome, 'workspace-hash', 'chat-later')
    const laterTranscript = await writeTranscript(cursorHome, 'slug', 'chat-later', [])
    await utimes(workspaceDir, fixedTime, fixedTime)
    expect((await stat(workspaceDir)).mtimeMs).toBe(fixedTime.getTime())

    expect((await stat(workspacePath)).mtimeMs).not.toBe(1_000)
    expect(await cursorChatMetaPath(laterTranscript)).toBe(laterMetaPath)
  })

  it('coalesces concurrent stale misses and reuses the refreshed index across a scan', async () => {
    const cursorHome = await createCursorHome()
    const firstTranscript = await writeTranscript(cursorHome, 'slug', 'first', [])
    const firstMetaPath = await writeChatMeta(cursorHome, 'workspace-hash', 'first')
    await writeChatMeta(cursorHome, 'other-workspace', 'existing')
    const workspaceDirs = [
      join(cursorHome, 'chats', 'workspace-hash'),
      join(cursorHome, 'chats', 'other-workspace')
    ]
    const fixedTime = new Date('2024-01-01T00:00:00.000Z')
    await Promise.all(workspaceDirs.map((dir) => utimes(dir, fixedTime, fixedTime)))
    await cursorChatMetaPath(firstTranscript)
    const newChats = await Promise.all(
      [
        ['second', 'workspace-hash'],
        ['third', 'other-workspace']
      ].map(async ([chatId, workspaceHash]) => ({
        transcript: await writeTranscript(cursorHome, 'slug', chatId, []),
        meta: await writeChatMeta(cursorHome, workspaceHash, chatId)
      }))
    )
    const absentTranscript = await writeTranscript(cursorHome, 'slug', 'absent', [])
    await Promise.all(workspaceDirs.map((dir) => utimes(dir, fixedTime, fixedTime)))
    workspaceReads = 0
    chatsRootReads = 0

    const paths = await withCursorChatMetaScan(async () => {
      const concurrent = await Promise.all(
        newChats.map(({ transcript }) => cursorChatMetaPath(transcript))
      )
      expect(await cursorChatMetaPath(absentTranscript)).toBeUndefined()
      expect(await cursorChatMetaPath(absentTranscript)).toBeUndefined()
      const repeated = await cursorChatMetaPath(firstTranscript)
      return [...concurrent, repeated]
    })
    expect(paths).toEqual([...newChats.map(({ meta }) => meta), firstMetaPath])
    expect(workspaceReads).toBe(2)
    expect(chatsRootReads).toBe(2)
  })

  it('does not rebuild for positive cached hits or retry a missing chat from a fresh index', async () => {
    const cursorHome = await createCursorHome()
    const metaPath = await writeChatMeta(cursorHome, 'workspace-hash', 'first')
    const firstTranscript = await writeTranscript(cursorHome, 'slug', 'first', [])
    const absentTranscript = await writeTranscript(cursorHome, 'slug', 'absent', [])
    await cursorChatMetaPath(firstTranscript)
    workspaceReads = 0
    chatsRootReads = 0

    await withCursorChatMetaScan(async () => {
      expect(await cursorChatMetaPath(firstTranscript)).toBe(metaPath)
      expect(await cursorChatMetaPath(firstTranscript)).toBe(metaPath)
    })
    expect(chatsRootReads).toBe(1)
    expect(workspaceReads).toBe(0)

    resetCursorChatMetaIndexCacheForTests()
    workspaceReads = 0
    chatsRootReads = 0
    await withCursorChatMetaScan(async () => {
      expect(await cursorChatMetaPath(absentTranscript)).toBeUndefined()
      expect(await cursorChatMetaPath(absentTranscript)).toBeUndefined()
    })
    expect(workspaceReads).toBe(1)
    expect(chatsRootReads).toBe(1)
  })

  it('keeps a refused stale-cache refresh unavailable for this scan and heals on the next', async () => {
    const cursorHome = await createCursorHome()
    await writeChatMeta(cursorHome, 'workspace-hash', 'first')
    const firstTranscript = await writeTranscript(cursorHome, 'slug', 'first', [])
    const workspaceDir = join(cursorHome, 'chats', 'workspace-hash')
    const fixedTime = new Date('2024-01-01T00:00:00.000Z')
    await utimes(workspaceDir, fixedTime, fixedTime)
    await cursorChatMetaPath(firstTranscript)
    const laterMeta = await writeChatMeta(cursorHome, 'workspace-hash', 'later')
    const laterTranscript = await writeTranscript(cursorHome, 'slug', 'later', [])
    await utimes(workspaceDir, fixedTime, fixedTime)
    failNextChatsReaddir = true
    workspaceReads = 0

    await withCursorChatMetaScan(async () => {
      expect(await cursorChatMetaPath(laterTranscript)).toBeUndefined()
      expect(await cursorChatMetaPath(laterTranscript)).toBeUndefined()
      expect(cursorChatMetaRefusals()).toEqual([
        { chatsRoot: join(cursorHome, 'chats'), text: { message: 'wsl fs timed out' } }
      ])
    })
    expect(workspaceReads).toBe(1)
    await expect(withCursorChatMetaScan(() => cursorChatMetaPath(laterTranscript))).resolves.toBe(
      laterMeta
    )
  })
})

async function cursorCandidate(cursorHome: string): Promise<FileWithMtime> {
  const issues: AiVaultScanIssue[] = []
  const discovery = await discoverFiles({
    rootDir: join(cursorHome, 'projects'),
    limit: 10,
    agent: 'cursor',
    issues,
    extensions: [...AI_VAULT_AGENT_SOURCES.cursor.extensions],
    filePredicate: AI_VAULT_AGENT_SOURCES.cursor.filePredicate,
    contentDependencyPath: AI_VAULT_AGENT_SOURCES.cursor.contentDependencyPath
  })
  return discovery.files[0]
}

/** Exercise the production sidecar merge in the parse cache. */
function parseCursorCached(
  file: FileWithMtime,
  stats: SessionParseStats = createSessionParseStats()
): Promise<{ session: AiVaultSession | null; stats: SessionParseStats }> {
  return withCursorChatMetaScan(async () => {
    const session = await parseAgentSessionFileCached(
      { agent: 'cursor', file, codexHome: null },
      'darwin',
      stats
    )
    return { session, stats }
  })
}

async function writeCursorScanFixture(chatIds: string[]): Promise<{
  cursorHome: string
  scanOptions: ReturnType<typeof isolatedScanRoots> & { cursorProjectsDir: string }
}> {
  const cursorHome = await createCursorHome()
  for (const chatId of chatIds) {
    await writeChatMeta(cursorHome, 'workspace-hash', chatId, { cwd: `/tmp/ws-${chatId}` })
    await writeTranscript(cursorHome, 'slug', chatId, [
      JSON.stringify({ role: 'user', message: { content: [{ type: 'text', text: chatId }] } })
    ])
  }
  const root = join(cursorHome, '..')
  return {
    cursorHome,
    scanOptions: {
      ...isolatedScanRoots(root),
      cursorProjectsDir: join(cursorHome, 'projects')
    }
  }
}

describe('cursor sidecar enrichment', () => {
  it('re-enriches without a parse when only the sidecar is rewritten', async () => {
    const cursorHome = await createCursorHome()
    await writeChatMeta(cursorHome, 'workspace-hash', 'chat-8', { cwd: '/repo/first' })
    await writeTranscript(cursorHome, 'slug', 'chat-8', [
      JSON.stringify({ role: 'user', message: { content: 'hi' } })
    ])
    resetSessionParseCacheForTests()
    await parseCursorCached(await cursorCandidate(cursorHome))

    const future = new Date(Date.now() + 10_000)
    await writeChatMeta(cursorHome, 'workspace-hash', 'chat-8', { cwd: '/repo/second' })
    await utimes(join(cursorHome, 'chats', 'workspace-hash', 'chat-8', 'meta.json'), future, future)

    const { session, stats } = await parseCursorCached(await cursorCandidate(cursorHome))

    expect(stats.reused).toBe(1)
    expect(stats.fullParses).toBe(0)
    expect(stats.incremental).toBe(0)
    // An updated sidecar must replace already-merged metadata, not merely fill null fields.
    expect(session?.cwd).toBe('/repo/second')
    expect(session?.resumeCommand).toContain('/repo/second')
  })

  it('keeps the stored merge when a sidecar-only re-merge is cancelled', async () => {
    const cursorHome = await createCursorHome()
    await writeChatMeta(cursorHome, 'workspace-hash', 'chat-9', { cwd: '/repo/first' })
    await writeTranscript(cursorHome, 'slug', 'chat-9', [
      JSON.stringify({ role: 'user', message: { content: 'hi' } })
    ])
    resetSessionParseCacheForTests()
    await parseCursorCached(await cursorCandidate(cursorHome))
    const future = new Date(Date.now() + 10_000)
    await writeChatMeta(cursorHome, 'workspace-hash', 'chat-9', { cwd: '/repo/second' })
    await utimes(join(cursorHome, 'chats', 'workspace-hash', 'chat-9', 'meta.json'), future, future)
    const candidate = await cursorCandidate(cursorHome)
    const before = getSessionParseCacheEntry(candidate.path)

    const controller = new AbortController()
    cancelMetaJsonReads = controller
    await expect(
      withCursorChatMetaScan(() =>
        parseAgentSessionFileCached(
          { agent: 'cursor', file: candidate, codexHome: null },
          'darwin',
          undefined,
          undefined,
          controller.signal
        )
      )
    ).rejects.toSatisfy(isAiVaultScanCancelledError)
    cancelMetaJsonReads = null

    expect(getSessionParseCacheEntry(candidate.path)?.session?.cwd).toBe('/repo/first')
    expect(getSessionParseCacheEntry(candidate.path)?.sidecar).toEqual(before?.sidecar)
    const { session, stats } = await parseCursorCached(candidate)
    expect(stats.fullParses).toBe(0)
    expect(session?.cwd).toBe('/repo/second')
  })
})

describe('cursor chat meta scan failures', () => {
  it('lists cursor sessions without metadata when the chats tree is refused, then heals', async () => {
    const { cursorHome, scanOptions } = await writeCursorScanFixture(['chat-a', 'chat-b'])
    resetSessionParseCacheForTests()

    failNextChatsRootReaddir = true
    const refused = await scanAiVaultSessions({ ...scanOptions, platform: 'darwin', limit: 20 })
    const refusedCursor = refused.sessions.filter((session) => session.agent === 'cursor')
    expect(refusedCursor).toHaveLength(2)
    expect(refusedCursor.map((session) => session.cwd)).toEqual([null, null])
    expect(refused.issues).toHaveLength(1)
    expect(refused.issues[0].path).toBe(join(cursorHome, 'chats'))
    expect(refused.issues[0].agent).toBe('cursor')

    const healed = await scanAiVaultSessions({ ...scanOptions, platform: 'darwin', limit: 20 })
    expect(healed.issues).toEqual([])
    expect(
      healed.sessions
        .filter((session) => session.agent === 'cursor')
        .map((session) => session.cwd)
        .sort()
    ).toEqual(['/tmp/ws-chat-a', '/tmp/ws-chat-b'])
  })

  it('re-enriches after a refused meta.json read without losing the resume cursor', async () => {
    const { scanOptions } = await writeCursorScanFixture(['chat-a'])
    resetSessionParseCacheForTests()

    failMetaJsonReads = true
    const refused = await scanAiVaultSessions({ ...scanOptions, platform: 'darwin', limit: 20 })
    const listed = refused.sessions.find((session) => session.agent === 'cursor')
    expect(listed?.cwd).toBeNull()
    expect(refused.issues).toHaveLength(1)

    // Unknown metadata must preserve the transcript fold and resume point for a byte-free retry.
    const entry = getSessionParseCacheEntry(listed?.filePath ?? '')
    expect(entry?.sidecar).toBe('unknown')
    expect(entry?.resume).not.toBeNull()

    failMetaJsonReads = false
    const healed = await scanAiVaultSessions({ ...scanOptions, platform: 'darwin', limit: 20 })
    expect(healed.issues).toEqual([])
    expect(healed.sessions.find((session) => session.agent === 'cursor')?.cwd).toBe(
      '/tmp/ws-chat-a'
    )
  })

  it('treats a local EACCES on the sidecar stat as unknown, not as absent', async () => {
    const { scanOptions } = await writeCursorScanFixture(['chat-a'])
    resetSessionParseCacheForTests()

    // Native EACCES lacks the WSL error wrapper but still cannot prove sidecar absence.
    failMetaJsonStats = 'eacces'
    const refused = await scanAiVaultSessions({ ...scanOptions, platform: 'darwin', limit: 20 })
    const listed = refused.sessions.find((session) => session.agent === 'cursor')
    expect(listed?.sessionId).toBeTruthy()
    expect(refused.issues).toHaveLength(1)
    expect(refused.issues[0].agent).toBe('cursor')
    expect(getSessionParseCacheEntry(listed?.filePath ?? '')?.sidecar).toBe('unknown')

    failMetaJsonStats = false
    const healed = await scanAiVaultSessions({ ...scanOptions, platform: 'darwin', limit: 20 })
    expect(healed.issues).toEqual([])
    expect(healed.sessions.find((session) => session.agent === 'cursor')?.cwd).toBe(
      '/tmp/ws-chat-a'
    )
  })
})

it('lists a Cursor session once meta.json names the scope after a scan stored it as cwd-less', async () => {
  const cursorHome = await createCursorHome()
  const path = await writeTranscript(cursorHome, 'slug', 'chat-1', [
    JSON.stringify({ role: 'user', message: { content: 'Find the bug' } })
  ])
  await utimes(path, 1, 1)
  for (const chatId of ['busy-1', 'busy-2']) {
    await writeTranscript(cursorHome, 'slug', chatId, [
      JSON.stringify({ role: 'user', message: { content: chatId } })
    ])
  }
  const scan = () =>
    scanAiVaultSessions({
      ...isolatedScanRoots(join(cursorHome, '..')),
      cursorProjectsDir: join(cursorHome, 'projects'),
      platform: 'darwin',
      limit: 1,
      scopePaths: ['/repo']
    })
  expect((await scan()).sessions.some((row) => row.filePath === path)).toBe(false)
  lookupSessionScopeCwds([path])
  expect(resolveSessionScopeCwd(path, () => true)).toEqual({ cwd: null })
  await writeChatMeta(cursorHome, 'workspace-hash', 'chat-1', { cwd: '/repo' })
  const found = (await scan()).sessions.filter((row) => row.filePath === path)
  expect(found.map((row) => row.cwd)).toEqual(['/repo'])
})
