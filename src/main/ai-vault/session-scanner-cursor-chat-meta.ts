import { AsyncLocalStorage } from 'node:async_hooks'
import { basename, dirname, join } from 'node:path'
import { WslTranscriptFsError } from '../native-chat/wsl-transcript-fs-gate'
import {
  readCursorChatMetaIndex,
  type CursorChatMetaIndexLookup
} from './session-scanner-cursor-chat-meta-index'
export { resetCursorChatMetaIndexCacheForTests } from './session-scanner-cursor-chat-meta-index'
import { timestampIso } from './session-scanner-accumulator'
import { scanIssueTextFromError } from './session-scan-issues'
import type { AiVaultScanIssueText } from '../../shared/ai-vault-scan-issue-copy'
import { extractString, normalizeTitleText, readJsonObjectIfExists } from './session-scanner-values'

// Transcript paths cannot derive hashed metadata buckets; index the separate chats tree by chat ID.

const CURSOR_CHATS_DIR = 'chats'
const CURSOR_TRANSCRIPTS_DIR = 'agent-transcripts'
const CURSOR_PROJECTS_DIR = 'projects'

export type CursorChatMeta = {
  title: string | null
  cwd: string | null
  createdAt: string | null
  updatedAt: string | null
}

type CursorChatMetaScan = {
  index: Map<string, Promise<CursorChatMetaIndexLookup>>
  refreshedIndex: Map<string, Promise<CursorChatMetaIndexLookup>>
  // Chats roots this scan could not read, reported once by the scan owner.
  refusals: Map<string, AiVaultScanIssueText>
  // Refused metadata reads must remain unknown rather than validate cached enrichment.
  refusedTranscripts: Set<string>
}

// Why: validating the module cache costs a readdir of the chats root plus a stat
// per workspace, and it cannot be skipped because the signature is built from
// those stats. Discovery asks once per transcript and finalize asks again, so
// the scope spans both phases; only a cached miss can trigger one extra build.
const scanScopedIndex = new AsyncLocalStorage<CursorChatMetaScan>()

/** Runs one whole scan, discovery and parse; Cursor transcripts share validation and any refresh. */
export function withCursorChatMetaScan<T>(fn: () => Promise<T>): Promise<T> {
  return scanScopedIndex.run(
    {
      index: new Map(),
      refreshedIndex: new Map(),
      refusals: new Map(),
      refusedTranscripts: new Set()
    },
    fn
  )
}

/** Mark refused metadata unknown while retaining the transcript fold and resume point. */
export function wasCursorChatMetaRefused(transcriptPath: string): boolean {
  return scanScopedIndex.getStore()?.refusedTranscripts.has(transcriptPath) ?? false
}

/** Whether this scan could not look for the transcript's meta.json, so its absence proves nothing. */
export function cursorChatMetaUnavailable(transcriptPath: string): boolean {
  const chatsRoot = cursorChatsRootFromTranscriptPath(transcriptPath)
  return (
    wasCursorChatMetaRefused(transcriptPath) ||
    (chatsRoot !== null && scanScopedIndex.getStore()?.refusals.has(chatsRoot) === true)
  )
}

export function cursorChatMetaRefusals(): {
  chatsRoot: string
  text: AiVaultScanIssueText
}[] {
  const scan = scanScopedIndex.getStore()
  return scan ? [...scan.refusals].map(([chatsRoot, text]) => ({ chatsRoot, text })) : []
}

/** Path a discovery stat can watch so a rewritten meta.json invalidates the parse cache. */
export async function cursorChatMetaPath(transcriptPath: string): Promise<string | undefined> {
  const chatsRoot = cursorChatsRootFromTranscriptPath(transcriptPath)
  const chatId = cursorChatIdFromTranscriptPath(transcriptPath)
  if (!chatsRoot || !chatId) {
    return undefined
  }
  const scan = scanScopedIndex.getStore()
  let index = await readCursorChatMetaIndexOncePerScan(chatsRoot, scan)
  const cachedPath = index.metaPathByChatId.get(chatId)
  if (cachedPath || !index.fromCache) {
    return cachedPath
  }
  if (scan) {
    let refresh = scan.refreshedIndex.get(chatsRoot)
    if (!refresh) {
      refresh = readCursorChatMetaIndexOrNone(chatsRoot, true)
      scan.refreshedIndex.set(chatsRoot, refresh)
    }
    index = await refresh
  } else {
    index = await readCursorChatMetaIndexOrNone(chatsRoot, true)
  }
  return index.metaPathByChatId.get(chatId)
}

function readCursorChatMetaIndexOncePerScan(
  chatsRoot: string,
  scan: CursorChatMetaScan | undefined
): Promise<CursorChatMetaIndexLookup> {
  if (!scan) {
    return readCursorChatMetaIndexOrNone(chatsRoot)
  }
  let pending = scan.index.get(chatsRoot)
  if (!pending) {
    pending = readCursorChatMetaIndexOrNone(chatsRoot)
    scan.index.set(chatsRoot, pending)
  }
  return pending
}

/**
 * A refused WSL read is not "no chats", but it must not take the transcript
 * down with it: before this join a stalled distro could not hide a Cursor
 * session at all. Degrade to no metadata for the scan and report the root once.
 * The session still lists from its transcript alone, and the sidecar is
 * recorded as unknown, so the next healthy scan merges the real metadata in
 * without re-reading a byte of the transcript.
 */
async function readCursorChatMetaIndexOrNone(
  chatsRoot: string,
  forceFresh = false
): Promise<CursorChatMetaIndexLookup> {
  try {
    return await readCursorChatMetaIndex(chatsRoot, forceFresh)
  } catch (error) {
    if (!(error instanceof WslTranscriptFsError)) {
      throw error
    }
    recordCursorChatMetaRefusal(chatsRoot, scanIssueTextFromError(error))
    return { metaPathByChatId: new Map(), fromCache: false }
  }
}

function recordCursorChatMetaRefusal(chatsRoot: string, text: AiVaultScanIssueText): void {
  const scan = scanScopedIndex.getStore()
  if (scan && !scan.refusals.has(chatsRoot)) {
    scan.refusals.set(chatsRoot, text)
  }
}

export async function readCursorChatMeta(
  transcriptPath: string,
  signal?: AbortSignal
): Promise<CursorChatMeta | null> {
  const metaPath = await cursorChatMetaPath(transcriptPath)
  if (!metaPath) {
    return null
  }
  let record: Record<string, unknown> | null
  try {
    record = await readJsonObjectIfExists(metaPath, signal)
  } catch (error) {
    if (!(error instanceof WslTranscriptFsError)) {
      throw error
    }
    // Discovery observed this sidecar; mark its refused read unknown instead of validating un-enriched results.
    recordCursorChatMetaRefusal(
      cursorChatsRootFromTranscriptPath(transcriptPath) ?? metaPath,
      scanIssueTextFromError(error)
    )
    scanScopedIndex.getStore()?.refusedTranscripts.add(transcriptPath)
    return null
  }
  if (!record) {
    return null
  }
  return {
    title: normalizeTitleText(extractString(record.title) ?? ''),
    cwd: extractString(record.cwd),
    createdAt: timestampIso(record.createdAtMs),
    updatedAt: timestampIso(record.updatedAtMs)
  }
}

function cursorChatIdFromTranscriptPath(transcriptPath: string): string | null {
  const chatDir = dirname(transcriptPath)
  return basename(dirname(chatDir)) === CURSOR_TRANSCRIPTS_DIR ? basename(chatDir) : null
}

function cursorChatsRootFromTranscriptPath(transcriptPath: string): string | null {
  let currentDir = dirname(transcriptPath)
  while (currentDir && dirname(currentDir) !== currentDir) {
    // The chats tree is a sibling of the projects tree, custom Cursor homes included.
    if (basename(currentDir) === CURSOR_PROJECTS_DIR) {
      return join(dirname(currentDir), CURSOR_CHATS_DIR)
    }
    currentDir = dirname(currentDir)
  }
  return null
}
