import { join } from 'node:path'
import { wslGatedReaddir, wslGatedStat } from '../native-chat/wsl-transcript-fs-access'
import { WslTranscriptFsError } from '../native-chat/wsl-transcript-fs-gate'

const CURSOR_CHAT_META_FILE = 'meta.json'
// Why: custom and WSL Cursor homes can vary over a long-lived main process.
const CURSOR_CHAT_META_INDEX_CACHE_MAX = 8

type CursorChatMetaIndexEntry = {
  signature: string
  metaPathByChatId: Map<string, string>
}

export type CursorChatMetaIndexLookup = {
  metaPathByChatId: Map<string, string>
  fromCache: boolean
}

const cursorChatMetaIndexCache = new Map<string, Promise<CursorChatMetaIndexEntry>>()

export function resetCursorChatMetaIndexCacheForTests(): void {
  cursorChatMetaIndexCache.clear()
}

export async function readCursorChatMetaIndex(
  chatsRoot: string,
  forceFresh = false
): Promise<CursorChatMetaIndexLookup> {
  let workspaceDirs: string[]
  try {
    workspaceDirs = (await wslGatedReaddir(chatsRoot, 'scan'))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  } catch (error) {
    // Why: a refused WSL read is not "no chats"; letting it through keeps the
    // session out of the parse cache instead of caching it without metadata.
    if (error instanceof WslTranscriptFsError) {
      throw error
    }
    return { metaPathByChatId: new Map(), fromCache: false }
  }
  const signature = await readCursorChatsSignature(chatsRoot, workspaceDirs)
  if (!forceFresh) {
    const cached = await readCachedCursorChatMetaIndex(chatsRoot, signature)
    if (cached) {
      return { metaPathByChatId: cached, fromCache: true }
    }
  }
  const pending = buildCursorChatMetaIndex(chatsRoot, workspaceDirs).then((metaPathByChatId) => ({
    signature,
    metaPathByChatId
  }))
  storeCursorChatMetaIndexEntry(chatsRoot, pending)
  // Why: a rejected build (a refused WSL read) must not be served from the
  // cache forever; the next scan rebuilds while this one still sees the error.
  pending.catch(() => {
    if (cursorChatMetaIndexCache.get(chatsRoot) === pending) {
      cursorChatMetaIndexCache.delete(chatsRoot)
    }
  })
  return { metaPathByChatId: (await pending).metaPathByChatId, fromCache: false }
}

// Why: a new chat only bumps its own workspace directory, so the chats root's
// own mtime would keep serving an index that is missing the newest sessions.
async function readCursorChatsSignature(
  chatsRoot: string,
  workspaceDirs: string[]
): Promise<string> {
  const parts = await Promise.all(
    workspaceDirs.map(async (name) => {
      try {
        const dirStat = await wslGatedStat(join(chatsRoot, name), 'scan')
        return `${name}:${dirStat.mtimeMs}`
      } catch {
        return `${name}:?`
      }
    })
  )
  return parts.join('|')
}

async function buildCursorChatMetaIndex(
  chatsRoot: string,
  workspaceDirs: string[]
): Promise<Map<string, string>> {
  const metaPathByChatId = new Map<string, string>()
  for (const workspaceDir of workspaceDirs) {
    let chatDirs
    try {
      chatDirs = await wslGatedReaddir(join(chatsRoot, workspaceDir), 'scan')
    } catch (error) {
      if (error instanceof WslTranscriptFsError) {
        throw error
      }
      continue
    }
    for (const chatDir of chatDirs) {
      // Why: the same chat id never appears under two workspace hashes, so the
      // first hit wins and a duplicate would only cost a wasted read.
      if (chatDir.isDirectory() && !metaPathByChatId.has(chatDir.name)) {
        metaPathByChatId.set(
          chatDir.name,
          join(chatsRoot, workspaceDir, chatDir.name, CURSOR_CHAT_META_FILE)
        )
      }
    }
  }
  return metaPathByChatId
}

async function readCachedCursorChatMetaIndex(
  chatsRoot: string,
  signature: string
): Promise<Map<string, string> | undefined> {
  const cached = cursorChatMetaIndexCache.get(chatsRoot)
  if (!cached) {
    return undefined
  }
  const entry = await cached
  if (entry.signature !== signature) {
    return undefined
  }
  // Why: a concurrent scan can replace this Promise while it resolves; only the
  // still-current entry may refresh recency without bypassing the cap.
  if (cursorChatMetaIndexCache.get(chatsRoot) === cached) {
    cursorChatMetaIndexCache.delete(chatsRoot)
    cursorChatMetaIndexCache.set(chatsRoot, cached)
  }
  return entry.metaPathByChatId
}

function storeCursorChatMetaIndexEntry(
  chatsRoot: string,
  pending: Promise<CursorChatMetaIndexEntry>
): void {
  cursorChatMetaIndexCache.delete(chatsRoot)
  cursorChatMetaIndexCache.set(chatsRoot, pending)
  if (cursorChatMetaIndexCache.size > CURSOR_CHAT_META_INDEX_CACHE_MAX) {
    const oldest = cursorChatMetaIndexCache.keys().next()
    if (!oldest.done) {
      cursorChatMetaIndexCache.delete(oldest.value)
    }
  }
}
