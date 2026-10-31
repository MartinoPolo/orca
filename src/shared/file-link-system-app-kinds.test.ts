import { describe, expect, it } from 'vitest'
import {
  fileLinkOpensInSystemApp,
  fileLinkSystemAppKindForPath
} from './file-link-system-app-kinds'

describe('file link system app kinds', () => {
  it.each([
    ['/repo/shot.PNG', 'image'],
    ['/repo/manual.pdf', 'pdf'],
    ['/repo/clip.mp4', 'media'],
    ['/repo/song.mp3', 'media'],
    ['/repo/bundle.zip', 'binary'],
    ['/repo/movie.mkv', 'binary'],
    ['/repo/src/main.ts', null],
    ['/repo/report.html', null],
    ['/repo/.gitignore', null],
    ['/repo/Makefile', null]
  ])('classifies %s as %s', (path, kind) => {
    expect(fileLinkSystemAppKindForPath(path)).toBe(kind)
  })

  it('opens every non-text kind with the default app when the setting is absent', () => {
    expect(fileLinkOpensInSystemApp(undefined, '/repo/clip.mov')).toBe(true)
    expect(fileLinkOpensInSystemApp({}, '/repo/src/main.ts')).toBe(false)
  })

  it('keeps kinds missing from the setting in Orca', () => {
    const settings = { fileLinkSystemAppKinds: ['pdf' as const] }
    expect(fileLinkOpensInSystemApp(settings, '/repo/manual.pdf')).toBe(true)
    expect(fileLinkOpensInSystemApp(settings, '/repo/shot.png')).toBe(false)
  })
})
