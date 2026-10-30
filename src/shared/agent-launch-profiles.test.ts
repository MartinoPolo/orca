import { describe, expect, it } from 'vitest'
import {
  findAgentLaunchProfilesForTranscript,
  normalizeAgentLaunchProfiles,
  normalizeAgentAccountPath,
  normalizeRemoteAgentDirectory,
  remoteAgentDirectoriesOverlap,
  resolveRemoteAgentDirectory,
  scopeAgentLaunchProfilesToHost,
  agentAccountDirectoriesOverlap,
  transcriptBelongsToAgentDirectory
} from './agent-launch-profiles'
import { getDefaultPiAgentDirectory, isDefaultPiTranscriptPath } from './pi-launch-profiles'

describe('agent launch profiles', () => {
  it('keeps only complete profiles with absolute account directories and stable ids', () => {
    expect(
      normalizeAgentLaunchProfiles([
        {
          id: 'work',
          name: ' Work ',
          command: ' C:/_MP_projects/mpx/bin/piw ',
          agentDirectory: ' C:\\Users\\ada\\.pi-work\\agent '
        },
        {
          id: 'work',
          name: 'Duplicate',
          command: 'pi',
          agentDirectory: '/accounts/duplicate'
        },
        {
          id: 'relative',
          name: 'Relative',
          command: 'pi',
          agentDirectory: '.pi/agent'
        },
        { id: 'posix-root', name: 'Root', command: 'pi', agentDirectory: '/' },
        {
          id: 'bad id',
          name: 'Bad',
          command: 'pi',
          agentDirectory: '/accounts/bad'
        }
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
      transcriptBelongsToAgentDirectory(
        'c:/users/ADA/.PI-WORK/agent/sessions/session.jsonl',
        'C:\\Users\\ada\\.pi-work\\agent'
      )
    ).toBe(true)
    expect(
      transcriptBelongsToAgentDirectory('/accounts/working/session.jsonl', '/accounts/work')
    ).toBe(false)
  })

  it('canonicalizes lexical path segments without changing POSIX case semantics', () => {
    expect(normalizeAgentAccountPath('C:\\Users\\ada\\work\\..\\personal\\.\\agent')).toBe(
      'c:/users/ada/personal/agent'
    )
    expect(normalizeAgentAccountPath('\\\\server\\share\\work\\..\\personal\\agent')).toBe(
      '//server/share/personal/agent'
    )
    expect(normalizeAgentAccountPath('/Accounts/Work/../Personal/./agent')).toBe(
      '/Accounts/Personal/agent'
    )
    expect(normalizeAgentAccountPath('\\\\?\\C:\\Users\\ada\\.pi\\agent')).toBe('')
  })

  it('does not let traversal or POSIX case folding cross account boundaries', () => {
    expect(
      transcriptBelongsToAgentDirectory(
        '/accounts/work/../personal/sessions/session.jsonl',
        '/accounts/work'
      )
    ).toBe(false)
    expect(
      transcriptBelongsToAgentDirectory('/Accounts/work/sessions/session.jsonl', '/accounts/work')
    ).toBe(false)
    expect(agentAccountDirectoriesOverlap('/Accounts/work', '/accounts/work')).toBe(false)
    expect(
      agentAccountDirectoriesOverlap('C:/Accounts/Work/../Personal', 'c:/accounts/personal')
    ).toBe(true)
  })

  it('rejects unsupported extended Windows paths and normalized duplicate names', () => {
    expect(
      normalizeAgentLaunchProfiles([
        {
          id: 'extended',
          name: 'Extended',
          command: 'pi',
          agentDirectory: '\\\\?\\C:\\Users\\ada\\.pi\\agent'
        },
        {
          id: 'work',
          name: ' Work ',
          command: 'piw',
          agentDirectory: '/accounts/work'
        },
        {
          id: 'personal',
          name: 'work',
          command: 'pip',
          agentDirectory: '/accounts/personal'
        }
      ])
    ).toEqual([
      {
        id: 'work',
        name: 'Work',
        command: 'piw',
        agentDirectory: '/accounts/work'
      }
    ])
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
    const profiles = normalizeAgentLaunchProfiles([
      {
        id: 'parent',
        name: 'Parent',
        command: 'pi-parent',
        agentDirectory: '/accounts'
      },
      {
        id: 'work',
        name: 'Work',
        command: 'pi-work',
        agentDirectory: '/accounts/work'
      }
    ])

    expect(
      findAgentLaunchProfilesForTranscript(profiles, '/accounts/work/sessions/a.jsonl')
    ).toEqual(profiles)
  })
})

describe('remote agent account directories', () => {
  it('canonicalizes home-relative roots and rejects ones that could leave the home', () => {
    expect(normalizeRemoteAgentDirectory(' ~/.pi/agent-work/ ')).toBe('~/.pi/agent-work')
    expect(normalizeRemoteAgentDirectory('~\\.claude-work')).toBe('~/.claude-work')
    expect(normalizeRemoteAgentDirectory('.claude-work')).toBe('~/.claude-work')
    for (const invalid of [
      '~',
      '/home/agent/.pi',
      '~/../root',
      'C:/Users/ada',
      '~/a\nb',
      '~other/.pi'
    ]) {
      expect(normalizeRemoteAgentDirectory(invalid)).toBeNull()
    }
  })

  it('keeps a valid remote root on the profile and rejects the profile for an invalid one', () => {
    const profile = { id: 'work', name: 'Work', command: 'piw', agentDirectory: '/accounts/work' }
    expect(
      normalizeAgentLaunchProfiles([{ ...profile, remoteAgentDirectory: '.pi/agent-work' }])
    ).toEqual([{ ...profile, remoteAgentDirectory: '~/.pi/agent-work' }])
    expect(normalizeAgentLaunchProfiles([{ ...profile, remoteAgentDirectory: '/abs' }])).toEqual([])
  })

  it('resolves roots against the reported home using its separator style', () => {
    expect(resolveRemoteAgentDirectory('/home/agent/', '~/.pi/agent-work')).toBe(
      '/home/agent/.pi/agent-work'
    )
    expect(resolveRemoteAgentDirectory('C:\\Users\\agent', '~/.claude-work')).toBe(
      'C:\\Users\\agent\\.claude-work'
    )
    expect(resolveRemoteAgentDirectory('relative/home', '~/.pi')).toBeNull()
  })

  it('scopes only profiles with a remote root to an SSH host', () => {
    const local = { id: 'local', name: 'Local', command: 'pil', agentDirectory: '/accounts/local' }
    const work = { ...local, id: 'work', name: 'Work', remoteAgentDirectory: '~/.pi/agent-work' }

    expect(
      scopeAgentLaunchProfilesToHost([local, work], { kind: 'local', homeDirectory: '/u' })
    ).toEqual([local, work])
    expect(
      scopeAgentLaunchProfilesToHost([local, work], {
        kind: 'remote',
        homeDirectory: '/home/agent'
      })
    ).toEqual([{ ...work, agentDirectory: '/home/agent/.pi/agent-work' }])
  })

  it('detects overlapping remote roots on segment boundaries', () => {
    expect(remoteAgentDirectoriesOverlap('~/.pi', '~/.pi/agent-work')).toBe(true)
    expect(remoteAgentDirectoriesOverlap('~/.claude', '~/.claude-work')).toBe(false)
  })
})
