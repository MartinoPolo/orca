import { useRef, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import {
  normalizeAgentLaunchProfile,
  normalizeAgentProfileName,
  normalizeRemoteAgentDirectory,
  agentAccountDirectoriesOverlap,
  remoteAgentDirectoriesOverlap,
  type AgentLaunchProfile
} from '../../../../shared/agent-launch-profiles'
import {
  AGENT_LAUNCH_PROFILE_AGENTS,
  getAgentLaunchProfiles,
  type ProfileAgent
} from '../../../../shared/agent-launch-profile-agents'
import { translate } from '@/i18n/i18n'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { SettingsSubsectionHeader } from './SettingsFormControls'

const PROFILE_AGENT_SETTINGS = {
  pi: {
    toSettingsUpdate: (profiles: AgentLaunchProfile[]) => ({ piLaunchProfiles: profiles }),
    commandPlaceholder: 'piw',
    directoryPlaceholder: 'C:/Users/name/.pi-work/agent',
    remoteDirectoryPlaceholder: '~/.pi/agent-work'
  },
  claude: {
    toSettingsUpdate: (profiles: AgentLaunchProfile[]) => ({ claudeLaunchProfiles: profiles }),
    commandPlaceholder: 'ccw',
    directoryPlaceholder: 'C:/Users/name/.claude-work',
    remoteDirectoryPlaceholder: '~/.claude-work'
  }
} as const satisfies Record<
  ProfileAgent,
  {
    toSettingsUpdate: (profiles: AgentLaunchProfile[]) => Partial<GlobalSettings>
    commandPlaceholder: string
    directoryPlaceholder: string
    remoteDirectoryPlaceholder: string
  }
>

type ProfileDraft = Omit<AgentLaunchProfile, 'id' | 'remoteAgentDirectory'> & {
  id?: string
  remoteAgentDirectory: string
}

const EMPTY_DRAFT: ProfileDraft = {
  name: '',
  command: '',
  agentDirectory: '',
  remoteAgentDirectory: ''
}

export function AgentLaunchProfilesSetting({
  agent,
  settings,
  updateSettings
}: {
  agent: ProfileAgent
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
}): React.JSX.Element {
  const agentSettings = PROFILE_AGENT_SETTINGS[agent]
  const agentName = AGENT_LAUNCH_PROFILE_AGENTS[agent].label
  const profiles = getAgentLaunchProfiles(settings, agent)
  const [draft, setDraft] = useState<ProfileDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)
  const fieldId = (field: string): string => `${agent}-profile-${field}`

  const commitProfiles = async (
    nextProfiles: AgentLaunchProfile[],
    failureMessage: string
  ): Promise<boolean> => {
    if (pendingRef.current) {
      return false
    }
    pendingRef.current = true
    setPending(true)
    setError(null)
    try {
      await updateSettings(agentSettings.toSettingsUpdate(nextProfiles))
      return true
    } catch {
      setError(failureMessage)
      return false
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }

  const saveDraft = async (): Promise<void> => {
    if (!draft || pendingRef.current) {
      return
    }
    const remoteAgentDirectory = draft.remoteAgentDirectory.trim()
    if (remoteAgentDirectory && !normalizeRemoteAgentDirectory(remoteAgentDirectory)) {
      setError(
        translate(
          'settings.agentLaunchProfiles.invalidRemoteDirectory',
          'Enter a remote folder inside the SSH home, such as {{example}}.',
          { example: agentSettings.remoteDirectoryPlaceholder }
        )
      )
      return
    }
    const profile = normalizeAgentLaunchProfile({
      ...draft,
      id: draft.id ?? createBrowserUuid()
    })
    if (!profile) {
      setError(
        translate(
          'settings.agentLaunchProfiles.invalidProfile',
          'Enter a name, command, and explicit absolute account directory.'
        )
      )
      return
    }
    const otherProfiles = profiles.filter((candidate) => candidate.id !== profile.id)
    const duplicateName = otherProfiles.some(
      (candidate) =>
        normalizeAgentProfileName(candidate.name) === normalizeAgentProfileName(profile.name)
    )
    if (duplicateName) {
      setError(
        translate('settings.agentLaunchProfiles.duplicateName', 'Profile names must be unique.')
      )
      return
    }
    const conflicts = otherProfiles.some(
      (candidate) =>
        agentAccountDirectoriesOverlap(candidate.agentDirectory, profile.agentDirectory) ||
        (candidate.remoteAgentDirectory &&
          profile.remoteAgentDirectory &&
          remoteAgentDirectoriesOverlap(
            candidate.remoteAgentDirectory,
            profile.remoteAgentDirectory
          ))
    )
    if (conflicts) {
      setError(
        translate(
          'settings.agentLaunchProfiles.overlappingDirectory',
          'Account directories cannot be the same or nested inside one another.'
        )
      )
      return
    }
    const nextProfiles = draft.id
      ? profiles.map((candidate) => (candidate.id === draft.id ? profile : candidate))
      : [...profiles, profile]
    if (
      await commitProfiles(
        nextProfiles,
        translate(
          'settings.agentLaunchProfiles.saveError',
          'Could not save this {{agentName}} profile. Try again.',
          { agentName }
        )
      )
    ) {
      setDraft(null)
    }
  }

  const removeProfile = async (profileId: string): Promise<void> => {
    if (pendingRef.current) {
      return
    }
    await commitProfiles(
      profiles.filter((candidate) => candidate.id !== profileId),
      translate(
        'settings.agentLaunchProfiles.removeError',
        'Could not remove this {{agentName}} profile. Try again.',
        { agentName }
      )
    )
  }

  return (
    <section className="space-y-3">
      <SettingsSubsectionHeader
        title={translate('settings.agentLaunchProfiles.title', '{{agentName}} profiles', {
          agentName
        })}
        description={translate(
          'settings.agentLaunchProfiles.description',
          'Add {{agentName}} accounts with a fixed command and account directory; credentials stay in that directory. A remote folder (~/…) makes the profile available on SSH hosts, resolved against each host’s home. Profiles are not offered for WSL or paired runtimes. On Windows, the command must be valid in the configured native terminal shell (for example Git Bash for POSIX wrapper functions).',
          { agentName }
        )}
        action={
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (pendingRef.current) {
                return
              }
              setDraft({ ...EMPTY_DRAFT })
              setError(null)
            }}
          >
            <Plus />
            {translate('settings.agentLaunchProfiles.addProfile', 'Add profile')}
          </Button>
        }
      />
      {profiles.length > 0 ? (
        <div className="divide-y divide-border rounded-md border border-border">
          {profiles.map((profile) => (
            <div key={profile.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{profile.name}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {profile.remoteAgentDirectory
                    ? translate(
                        'settings.agentLaunchProfiles.directorySummary',
                        '{{localDirectory}} · SSH {{remoteDirectory}}',
                        {
                          localDirectory: profile.agentDirectory,
                          remoteDirectory: profile.remoteAgentDirectory
                        }
                      )
                    : profile.agentDirectory}
                </p>
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={translate(
                  'settings.agentLaunchProfiles.editProfile',
                  'Edit {{profileName}}',
                  { profileName: profile.name }
                )}
                disabled={pending}
                onClick={() => {
                  if (pendingRef.current) {
                    return
                  }
                  setDraft({ ...profile, remoteAgentDirectory: profile.remoteAgentDirectory ?? '' })
                  setError(null)
                }}
              >
                <Pencil />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={translate(
                  'settings.agentLaunchProfiles.removeProfile',
                  'Remove {{profileName}}',
                  { profileName: profile.name }
                )}
                disabled={pending}
                onClick={() => void removeProfile(profile.id)}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {translate(
            'settings.agentLaunchProfiles.defaultAvailable',
            'Default {{agentName}} remains available.',
            { agentName }
          )}
        </p>
      )}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {draft ? (
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="space-y-1">
            <Label htmlFor={fieldId('name')}>
              {translate('settings.agentLaunchProfiles.nameLabel', 'Name')}
            </Label>
            <Input
              id={fieldId('name')}
              value={draft.name}
              disabled={pending}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder={agentSettings.commandPlaceholder}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={fieldId('command')}>
              {translate('settings.agentLaunchProfiles.commandLabel', 'Command')}
            </Label>
            <Input
              id={fieldId('command')}
              value={draft.command}
              disabled={pending}
              onChange={(event) => setDraft({ ...draft, command: event.target.value })}
              placeholder={agentSettings.commandPlaceholder}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={fieldId('directory')}>
              {translate('settings.agentLaunchProfiles.accountDirectoryLabel', 'Account directory')}
            </Label>
            <Input
              id={fieldId('directory')}
              value={draft.agentDirectory}
              disabled={pending}
              onChange={(event) => setDraft({ ...draft, agentDirectory: event.target.value })}
              placeholder={agentSettings.directoryPlaceholder}
              aria-invalid={error ? true : undefined}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={fieldId('remote-directory')}>
              {translate(
                'settings.agentLaunchProfiles.remoteDirectoryLabel',
                'Remote folder (optional)'
              )}
            </Label>
            <Input
              id={fieldId('remote-directory')}
              value={draft.remoteAgentDirectory}
              disabled={pending}
              onChange={(event) => setDraft({ ...draft, remoteAgentDirectory: event.target.value })}
              placeholder={agentSettings.remoteDirectoryPlaceholder}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (!pendingRef.current) {
                  setDraft(null)
                  setError(null)
                }
              }}
            >
              {translate('settings.agentLaunchProfiles.cancel', 'Cancel')}
            </Button>
            <Button type="button" size="sm" disabled={pending} onClick={() => void saveDraft()}>
              {translate('settings.agentLaunchProfiles.save', 'Save')}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
