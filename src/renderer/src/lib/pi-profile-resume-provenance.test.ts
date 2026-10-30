import { describe, expect, it } from 'vitest'
import { resolvePiResumeLaunchConfig } from './pi-profile-resume-provenance'

const profiles = [
  {
    id: 'work',
    name: 'Work',
    command: 'C:/tools/piw',
    agentDirectory: 'C:/Users/ada/.pi-work/agent'
  }
]

describe('Pi resume account provenance', () => {
  it('keeps a captured concrete profile after the configured profile is deleted', () => {
    expect(
      resolvePiResumeLaunchConfig({
        transcriptPath: 'C:/Users/ada/.pi-work/agent/sessions/session.jsonl',
        launchConfig: {
          agentCommand: 'C:/old/piw',
          agentArgs: '--model test',
          agentEnv: {
            PI_CODING_AGENT_DIR: 'C:/Users/ada/.pi-work/agent',
            ORCA_PI_SOURCE_AGENT_DIR: 'C:/Users/ada/.pi-work/agent'
          }
        },
        profiles: []
      })
    ).toMatchObject({
      agentCommand: 'C:/old/piw',
      agentEnv: { PI_CODING_AGENT_DIR: 'C:/Users/ada/.pi-work/agent' }
    })
  })

  it('keeps a complete captured snapshot when the configured profile was edited', () => {
    const launchConfig = {
      agentCommand: 'C:/old/piw',
      agentArgs: '--model old',
      agentEnv: {
        PI_CODING_AGENT_DIR: 'C:/Users/ada/.pi-work/agent',
        ORCA_PI_SOURCE_AGENT_DIR: 'C:/Users/ada/.pi-work/agent'
      }
    }

    expect(
      resolvePiResumeLaunchConfig({
        transcriptPath: 'C:/Users/ada/.pi-work/agent/sessions/session.jsonl',
        launchConfig,
        profiles
      })
    ).toBe(launchConfig)
  })

  it('repins a work transcript whose captured command and environment belong to personal Pi', () => {
    expect(
      resolvePiResumeLaunchConfig({
        transcriptPath: 'c:\\users\\ADA\\.PI-WORK\\agent\\sessions\\session.jsonl',
        launchConfig: {
          agentCommand: 'pip',
          agentArgs: '',
          agentEnv: {
            PI_CODING_AGENT_DIR: 'C:/Users/ada/.pi-personal/agent',
            ORCA_PI_SOURCE_AGENT_DIR: 'C:/Users/ada/.pi-personal/agent'
          }
        },
        profiles
      })
    ).toEqual({
      agentCommand: 'C:/tools/piw',
      agentArgs: '',
      agentEnv: {
        PI_CODING_AGENT_DIR: 'C:/Users/ada/.pi-work/agent',
        ORCA_PI_SOURCE_AGENT_DIR: 'C:/Users/ada/.pi-work/agent'
      }
    })
  })

  it('does not select a current profile when origin provenance is unavailable', () => {
    expect(() =>
      resolvePiResumeLaunchConfig({
        transcriptPath: 'C:/Users/ada/.pi-work/agent/sessions/session.jsonl',
        launchConfig: {
          agentCommand: 'pip',
          agentArgs: '',
          agentEnv: { PI_CODING_AGENT_DIR: 'C:/Users/ada/.pi-personal/agent' }
        },
        profiles,
        allowProfileSelection: false
      })
    ).toThrow('origin host was never recorded')
  })

  it('keeps a matching explicit snapshot when origin provenance is unavailable', () => {
    const launchConfig = {
      agentCommand: 'C:/old/piw',
      agentArgs: '--model test',
      agentEnv: { PI_CODING_AGENT_DIR: 'C:/Users/ada/.pi-work/agent' }
    }

    expect(
      resolvePiResumeLaunchConfig({
        transcriptPath: 'C:/Users/ada/.pi-work/agent/sessions/session.jsonl',
        launchConfig,
        profiles: [],
        allowProfileSelection: false
      })
    ).toBe(launchConfig)
  })

  it('rejects invalid or disagreeing captured account roots', () => {
    expect(() =>
      resolvePiResumeLaunchConfig({
        transcriptPath: 'C:/Users/ada/.pi-work/agent/sessions/session.jsonl',
        launchConfig: {
          agentCommand: 'piw',
          agentArgs: '',
          agentEnv: {
            ORCA_PI_SOURCE_AGENT_DIR: 'C:/Users/ada/.pi-work/agent',
            PI_CODING_AGENT_DIR: 'C:/Users/ada/.pi-personal/agent'
          }
        },
        profiles
      })
    ).toThrow('disagree')
    expect(() =>
      resolvePiResumeLaunchConfig({
        transcriptPath: '/accounts/work/sessions/session.jsonl',
        launchConfig: {
          agentCommand: 'piw',
          agentArgs: '',
          agentEnv: { ORCA_PI_SOURCE_AGENT_DIR: 'relative/account' }
        },
        profiles
      })
    ).toThrow('invalid')
  })

  it('requires a current profile for a captured root without a concrete command', () => {
    expect(
      resolvePiResumeLaunchConfig({
        transcriptPath: 'C:/Users/ada/.pi-work/agent/sessions/session.jsonl',
        launchConfig: {
          agentArgs: '--model current',
          agentEnv: { ORCA_PI_SOURCE_AGENT_DIR: 'C:/Users/ada/.pi-work/agent' }
        },
        profiles
      })
    ).toMatchObject({ agentCommand: 'C:/tools/piw' })
    expect(() =>
      resolvePiResumeLaunchConfig({
        transcriptPath: 'C:/Users/ada/.pi-work/agent/sessions/session.jsonl',
        launchConfig: {
          agentArgs: '',
          agentEnv: { ORCA_PI_SOURCE_AGENT_DIR: 'C:/Users/ada/.pi-work/agent' }
        },
        profiles: []
      })
    ).toThrow('no concrete command')
  })

  it('refuses unknown and ambiguous account roots when profiles are configured', () => {
    expect(() =>
      resolvePiResumeLaunchConfig({
        transcriptPath: '/accounts/unknown/sessions/session.jsonl',
        launchConfig: { agentCommand: 'pi', agentArgs: '', agentEnv: {} },
        profiles
      })
    ).toThrow('refused to resume')

    expect(() =>
      resolvePiResumeLaunchConfig({
        transcriptPath: '/accounts/work/sessions/session.jsonl',
        launchConfig: { agentCommand: 'pi', agentArgs: '', agentEnv: {} },
        profiles: [
          { id: 'parent', name: 'Parent', command: 'pi-parent', agentDirectory: '/accounts' },
          { id: 'work', name: 'Work', command: 'pi-work', agentDirectory: '/accounts/work' }
        ]
      })
    ).toThrow('more than one')
  })

  it('refuses malformed configured profiles instead of treating them as no profiles', () => {
    expect(() =>
      resolvePiResumeLaunchConfig({
        transcriptPath: '/Users/ada/.pi/agent/sessions/session.jsonl',
        launchConfig: { agentCommand: 'pi', agentArgs: '', agentEnv: {} },
        profiles: [{ id: 'work', name: 'Work', command: '', agentDirectory: '/accounts/work' }]
      })
    ).toThrow('malformed')
  })

  it('refuses unknown custom history after the last profile is deleted', () => {
    expect(() =>
      resolvePiResumeLaunchConfig({
        transcriptPath: '/accounts/work/sessions/session.jsonl',
        launchConfig: { agentCommand: 'pi', agentArgs: '', agentEnv: {} },
        profiles: []
      })
    ).toThrow('cannot determine its account safely')
  })

  it('keeps a valid captured snapshot despite unrelated malformed current settings', () => {
    const launchConfig = {
      agentCommand: 'C:/old/piw',
      agentArgs: '--model test',
      agentEnv: { PI_CODING_AGENT_DIR: 'C:/Users/ada/.pi-work/agent' }
    }
    expect(
      resolvePiResumeLaunchConfig({
        transcriptPath: 'C:/Users/ada/.pi-work/agent/sessions/session.jsonl',
        launchConfig,
        profiles: [{ id: 'broken', name: 'Broken', command: '', agentDirectory: '/broken' }]
      })
    ).toBe(launchConfig)
  })

  it('keeps only trusted conventional default Pi sessions compatible', () => {
    const config = { agentCommand: 'pi', agentArgs: '', agentEnv: {} }
    const defaultAgentDirectory = '/Users/ada/.pi/agent'
    expect(
      resolvePiResumeLaunchConfig({
        transcriptPath: '/Users/ada/.pi/agent/sessions/session.jsonl',
        launchConfig: config,
        profiles: [],
        defaultAgentDirectory
      })
    ).toBe(config)
    expect(
      resolvePiResumeLaunchConfig({
        transcriptPath: '/Users/ada/.pi/agent/sessions/session.jsonl',
        launchConfig: config,
        profiles,
        defaultAgentDirectory
      })
    ).toBe(config)
    expect(
      resolvePiResumeLaunchConfig({
        transcriptPath: '/Users/ada/.pi/agent/sessions/session.jsonl',
        launchConfig: config,
        profiles,
        allowProfileSelection: false,
        defaultAgentDirectory
      })
    ).toBe(config)
    expect(() =>
      resolvePiResumeLaunchConfig({
        transcriptPath: 'D:/work/.pi/agent/sessions/session.jsonl',
        launchConfig: config,
        profiles: [],
        defaultAgentDirectory: 'C:/Users/ada/.pi/agent'
      })
    ).toThrow('cannot determine its account safely')
  })
})
