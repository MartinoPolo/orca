import { describe, expect, it } from 'vitest'
import {
  findPiLaunchProfilesForTranscript,
  getDefaultPiAgentDirectory,
  isDefaultPiTranscriptPath,
  normalizePiLaunchProfiles,
  normalizePiAccountPath,
  piAccountDirectoriesOverlap,
  piTranscriptBelongsToAgentDirectory
} from './pi-launch-profiles'

describe('Pi launch profiles', () => {
  it('keeps only complete profiles with absolute account directories and stable ids', () => {
    expect(
      normalizePiLaunchProfiles([
        {
          id: 'work',
          name: ' Work ',
          command: ' C:/_MP_projects/mpx/bin/piw ',
          agentDirectory: ' C:\\Users\\ada\\.pi-work\\agent '
        },
        { id: 'work', name: 'Duplicate', command: 'pi', agentDirectory: '/accounts/duplicate' },
        { id: 'relative', name: 'Relative', command: 'pi', agentDirectory: '.pi/agent' },
        { id: 'posix-root', name: 'Root', command: 'pi', agentDirectory: '/' },
        { id: 'bad id', name: 'Bad', command: 'pi', agentDirectory: '/accounts/bad' }
      ])
    ).toEqual([
      {
        id: 'work',
        name: 'Work',
        command: 'C:/_MP_projects/mpx/bin/piw',
        agentDirectory: 'C:\\Users\\ada\\.pi-work\\agent'
      }
    ])
  })

  it('matches transcript paths on segment boundaries with Windows case and slash folding', () => {
    expect(
      piTranscriptBelongsToAgentDirectory(
        'c:/users/ADA/.PI-WORK/agent/sessions/session.jsonl',
        'C:\\Users\\ada\\.pi-work\\agent'
      )
    ).toBe(true)
    expect(
      piTranscriptBelongsToAgentDirectory('/accounts/working/session.jsonl', '/accounts/work')
    ).toBe(false)
  })

  it('canonicalizes lexical path segments without changing POSIX case semantics', () => {
    expect(normalizePiAccountPath('C:\\Users\\ada\\work\\..\\personal\\.\\agent')).toBe(
      'c:/users/ada/personal/agent'
    )
    expect(normalizePiAccountPath('\\\\server\\share\\work\\..\\personal\\agent')).toBe(
      '//server/share/personal/agent'
    )
    expect(normalizePiAccountPath('/Accounts/Work/../Personal/./agent')).toBe(
      '/Accounts/Personal/agent'
    )
    expect(normalizePiAccountPath('\\\\?\\C:\\Users\\ada\\.pi\\agent')).toBe('')
  })

  it('does not let traversal or POSIX case folding cross account boundaries', () => {
    expect(
      piTranscriptBelongsToAgentDirectory(
        '/accounts/work/../personal/sessions/session.jsonl',
        '/accounts/work'
      )
    ).toBe(false)
    expect(
      piTranscriptBelongsToAgentDirectory('/Accounts/work/sessions/session.jsonl', '/accounts/work')
    ).toBe(false)
    expect(piAccountDirectoriesOverlap('/Accounts/work', '/accounts/work')).toBe(false)
    expect(
      piAccountDirectoriesOverlap('C:/Accounts/Work/../Personal', 'c:/accounts/personal')
    ).toBe(true)
  })

  it('rejects unsupported extended Windows paths and normalized duplicate names', () => {
    expect(
      normalizePiLaunchProfiles([
        {
          id: 'extended',
          name: 'Extended',
          command: 'pi',
          agentDirectory: '\\\\?\\C:\\Users\\ada\\.pi\\agent'
        },
        { id: 'work', name: ' Work ', command: 'piw', agentDirectory: '/accounts/work' },
        {
          id: 'personal',
          name: 'work',
          command: 'pip',
          agentDirectory: '/accounts/personal'
        }
      ])
    ).toEqual([{ id: 'work', name: 'Work', command: 'piw', agentDirectory: '/accounts/work' }])
  })

  it('recognizes the conventional account only from an explicit trusted home', () => {
    const defaultAgentDirectory = getDefaultPiAgentDirectory('C:/Users/ada')

    expect(defaultAgentDirectory).toBe('c:/users/ada/.pi/agent')
    expect(
      isDefaultPiTranscriptPath(
        'C:/Users/ada/.pi/agent/sessions/session.jsonl',
        defaultAgentDirectory
      )
    ).toBe(true)
    expect(
      isDefaultPiTranscriptPath('D:/work/.pi/agent/sessions/session.jsonl', defaultAgentDirectory)
    ).toBe(false)
    expect(
      isDefaultPiTranscriptPath('/Users/ada/.pi/agent/sessions/session.jsonl', undefined)
    ).toBe(false)
  })

  it('returns every matching profile so overlapping roots remain ambiguous', () => {
    const profiles = normalizePiLaunchProfiles([
      { id: 'parent', name: 'Parent', command: 'pi-parent', agentDirectory: '/accounts' },
      { id: 'work', name: 'Work', command: 'pi-work', agentDirectory: '/accounts/work' }
    ])

    expect(findPiLaunchProfilesForTranscript(profiles, '/accounts/work/sessions/a.jsonl')).toEqual(
      profiles
    )
  })
})
