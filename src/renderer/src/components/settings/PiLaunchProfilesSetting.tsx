import { useRef, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import {
  normalizePiLaunchProfile,
  normalizePiProfileName,
  piAccountDirectoriesOverlap,
  type PiLaunchProfile
} from '../../../../shared/pi-launch-profiles'
import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { SettingsSubsectionHeader } from './SettingsFormControls'

type ProfileDraft = Omit<PiLaunchProfile, 'id'> & { id?: string }

const EMPTY_DRAFT: ProfileDraft = { name: '', command: '', agentDirectory: '' }

function createProfileId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `pi-profile-${Date.now().toString(36)}`
}

export function PiLaunchProfilesSetting({
  settings,
  updateSettings
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
}): React.JSX.Element {
  const profiles = settings.piLaunchProfiles ?? []
  const [draft, setDraft] = useState<ProfileDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)

  const commitProfiles = async (
    nextProfiles: PiLaunchProfile[],
    failureMessage: string
  ): Promise<boolean> => {
    if (pendingRef.current) {
      return false
    }
    pendingRef.current = true
    setPending(true)
    setError(null)
    try {
      await updateSettings({ piLaunchProfiles: nextProfiles })
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
    const profile = normalizePiLaunchProfile({ ...draft, id: draft.id ?? createProfileId() })
    if (!profile) {
      setError(
        translate(
          'settings.piLaunchProfiles.invalidProfile',
          'Enter a name, command, and explicit absolute account directory.'
        )
      )
      return
    }
    const duplicateName = profiles.some(
      (candidate) =>
        candidate.id !== profile.id &&
        normalizePiProfileName(candidate.name) === normalizePiProfileName(profile.name)
    )
    if (duplicateName) {
      setError(
        translate('settings.piLaunchProfiles.duplicateName', 'Profile names must be unique.')
      )
      return
    }
    const conflicts = profiles.some(
      (candidate) =>
        candidate.id !== profile.id &&
        piAccountDirectoriesOverlap(candidate.agentDirectory, profile.agentDirectory)
    )
    if (conflicts) {
      setError(
        translate(
          'settings.piLaunchProfiles.overlappingDirectory',
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
          'settings.piLaunchProfiles.saveError',
          'Could not save this Pi profile. Try again.'
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
        'settings.piLaunchProfiles.removeError',
        'Could not remove this Pi profile. Try again.'
      )
    )
  }

  return (
    <section className="space-y-3">
      <SettingsSubsectionHeader
        title={translate('settings.piLaunchProfiles.title', 'Pi profiles')}
        description={translate(
          'settings.piLaunchProfiles.description',
          'Add local-native Pi accounts with a fixed command and account directory; credentials stay in that directory. Profiles are not offered for WSL, SSH, or paired runtimes. On Windows, the command must be valid in the configured native terminal shell (for example Git Bash for POSIX wrapper functions).'
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
            {translate('settings.piLaunchProfiles.addProfile', 'Add profile')}
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
                  {profile.agentDirectory}
                </p>
              </div>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={translate(
                  'settings.piLaunchProfiles.editProfile',
                  'Edit {{profileName}}',
                  { profileName: profile.name }
                )}
                disabled={pending}
                onClick={() => {
                  if (pendingRef.current) {
                    return
                  }
                  setDraft({ ...profile })
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
                  'settings.piLaunchProfiles.removeProfile',
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
          {translate('settings.piLaunchProfiles.defaultAvailable', 'Default Pi remains available.')}
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
            <Label htmlFor="pi-profile-name">
              {translate('settings.piLaunchProfiles.nameLabel', 'Name')}
            </Label>
            <Input
              id="pi-profile-name"
              value={draft.name}
              disabled={pending}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="piw"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pi-profile-command">
              {translate('settings.piLaunchProfiles.commandLabel', 'Command')}
            </Label>
            <Input
              id="pi-profile-command"
              value={draft.command}
              disabled={pending}
              onChange={(event) => setDraft({ ...draft, command: event.target.value })}
              placeholder="piw"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pi-profile-directory">
              {translate('settings.piLaunchProfiles.accountDirectoryLabel', 'Account directory')}
            </Label>
            <Input
              id="pi-profile-directory"
              value={draft.agentDirectory}
              disabled={pending}
              onChange={(event) => setDraft({ ...draft, agentDirectory: event.target.value })}
              placeholder="C:/Users/name/.pi-work/agent"
              aria-invalid={error ? true : undefined}
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
              {translate('settings.piLaunchProfiles.cancel', 'Cancel')}
            </Button>
            <Button type="button" size="sm" disabled={pending} onClick={() => void saveDraft()}>
              {translate('settings.piLaunchProfiles.save', 'Save')}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
