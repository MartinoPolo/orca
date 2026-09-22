// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import { PiLaunchProfilesSetting } from './PiLaunchProfilesSetting'

afterEach(cleanup)

const WORK_PROFILE = {
  id: 'work',
  name: 'Work',
  command: 'C:/tools/piw',
  agentDirectory: 'C:/Users/ada/.pi-work/agent'
}

type Deferred = {
  promise: Promise<void>
  resolve: () => void
}

function createDeferred(): Deferred {
  let resolve!: () => void
  const promise = new Promise<void>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

describe('PiLaunchProfilesSetting', () => {
  it('adds a complete profile and rejects relative account directories', async () => {
    const updateSettings = vi.fn()
    const user = userEvent.setup()
    render(
      <PiLaunchProfilesSetting
        settings={getDefaultSettings('/tmp')}
        updateSettings={updateSettings}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Add profile' }))
    await user.type(screen.getByLabelText('Name'), 'Work')
    await user.type(screen.getByLabelText('Command'), 'C:/tools/piw')
    await user.type(screen.getByLabelText('Account directory'), '.pi-work/agent')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('alert').textContent).toContain('explicit absolute account directory')
    expect(updateSettings).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText('Account directory'))
    await user.type(screen.getByLabelText('Account directory'), '/')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('alert').textContent).toContain('explicit absolute account directory')
    expect(updateSettings).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText('Account directory'))
    await user.type(screen.getByLabelText('Account directory'), 'C:/Users/ada/.pi-work/agent')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(updateSettings).toHaveBeenCalledWith({
      piLaunchProfiles: [
        expect.objectContaining({
          id: expect.any(String),
          name: 'Work',
          command: 'C:/tools/piw',
          agentDirectory: 'C:/Users/ada/.pi-work/agent'
        })
      ]
    })
  })

  it('rejects duplicate display names after trimming and case folding', async () => {
    const updateSettings = vi.fn()
    const user = userEvent.setup()
    const settings = {
      ...getDefaultSettings('/tmp'),
      piLaunchProfiles: [
        {
          id: 'work',
          name: 'Work',
          command: 'C:/tools/piw',
          agentDirectory: 'C:/Users/ada/.pi-work/agent'
        }
      ]
    }
    render(<PiLaunchProfilesSetting settings={settings} updateSettings={updateSettings} />)

    await user.click(screen.getByRole('button', { name: 'Add profile' }))
    await user.type(screen.getByLabelText('Name'), ' work ')
    await user.type(screen.getByLabelText('Command'), 'C:/tools/pip')
    await user.type(screen.getByLabelText('Account directory'), 'C:/Users/ada/.pi-personal/agent')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('alert').textContent).toContain('unique')
    expect(updateSettings).not.toHaveBeenCalled()
  })

  it('edits and removes an existing profile', async () => {
    const updateSettings = vi.fn()
    const user = userEvent.setup()
    const settings = {
      ...getDefaultSettings('/tmp'),
      piLaunchProfiles: [
        {
          id: 'work',
          name: 'Work',
          command: 'C:/tools/piw',
          agentDirectory: 'C:/Users/ada/.pi-work/agent'
        }
      ]
    }
    render(<PiLaunchProfilesSetting settings={settings} updateSettings={updateSettings} />)

    await user.click(screen.getByRole('button', { name: 'Edit Work' }))
    await user.clear(screen.getByLabelText('Command'))
    await user.type(screen.getByLabelText('Command'), 'C:/tools/pi-work')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(updateSettings).toHaveBeenCalledWith({
      piLaunchProfiles: [
        {
          id: 'work',
          name: 'Work',
          command: 'C:/tools/pi-work',
          agentDirectory: 'C:/Users/ada/.pi-work/agent'
        }
      ]
    })

    await user.click(screen.getByRole('button', { name: 'Remove Work' }))
    expect(updateSettings).toHaveBeenLastCalledWith({ piLaunchProfiles: [] })
  })

  it('keeps a rejected save draft visible and retries it', async () => {
    const updateSettings = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    render(
      <PiLaunchProfilesSetting
        settings={getDefaultSettings('/tmp')}
        updateSettings={updateSettings}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Add profile' }))
    expect(screen.getByLabelText('Name').getAttribute('placeholder')).toBe('piw')
    expect(screen.getByLabelText('Command').getAttribute('placeholder')).toBe('piw')
    await user.type(screen.getByLabelText('Name'), 'Work')
    await user.type(screen.getByLabelText('Command'), 'piw')
    await user.type(screen.getByLabelText('Account directory'), 'C:/Users/ada/.pi-work/agent')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not save this Pi profile'
    )
    expect(screen.getByLabelText<HTMLInputElement>('Name').value).toBe('Work')

    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByLabelText('Name')).toBeNull())
    expect(updateSettings).toHaveBeenCalledTimes(2)
  })

  it('shows a rejected removal and allows retry', async () => {
    const updateSettings = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce(undefined)
    const user = userEvent.setup()
    const settings = { ...getDefaultSettings('/tmp'), piLaunchProfiles: [WORK_PROFILE] }
    render(<PiLaunchProfilesSetting settings={settings} updateSettings={updateSettings} />)

    await user.click(screen.getByRole('button', { name: 'Remove Work' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not remove this Pi profile'
    )
    expect(screen.getByText('Work').textContent).toBe('Work')

    await user.click(screen.getByRole('button', { name: 'Remove Work' }))

    await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(2))
    expect(updateSettings).toHaveBeenLastCalledWith({ piLaunchProfiles: [] })
  })

  it('blocks overlapping mutations so a stale save cannot restore a pending deletion', async () => {
    const deletion = createDeferred()
    const updateSettings = vi.fn().mockReturnValue(deletion.promise)
    const settings = { ...getDefaultSettings('/tmp'), piLaunchProfiles: [WORK_PROFILE] }
    render(<PiLaunchProfilesSetting settings={settings} updateSettings={updateSettings} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Work' }))
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove Work' }))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })

    expect(updateSettings).toHaveBeenCalledTimes(1)
    expect(updateSettings).toHaveBeenCalledWith({ piLaunchProfiles: [] })
    expect(screen.getByRole('button', { name: 'Add profile' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Edit Work' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Remove Work' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByLabelText('Name').hasAttribute('disabled')).toBe(true)

    await act(async () => deletion.resolve())

    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(false)
  })
})
