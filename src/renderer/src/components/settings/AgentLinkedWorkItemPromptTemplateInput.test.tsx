// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentLinkedWorkItemPromptTemplateInput } from './AgentLaunchDefaultsEditor'

afterEach(cleanup)

describe('AgentLinkedWorkItemPromptTemplateInput', () => {
  it('saves a trimmed template and documents placeholder and literal behavior', () => {
    const onSave = vi.fn()
    render(<AgentLinkedWorkItemPromptTemplateInput template={undefined} onSave={onSave} />)

    const input = screen.getByRole('textbox', {
      name: 'Linked work-item prompt template'
    })
    expect(input.getAttribute('placeholder')).toBe('/skill:mpx-execute {{artifact_url}}')
    expect(screen.getByText(/template without it is used literally/i).textContent).toContain(
      'Leave blank to restore the default'
    )

    fireEvent.change(input, {
      target: { value: '  /skill:mpx-execute {{artifact_url}}  ' }
    })
    fireEvent.blur(input)

    expect(onSave).toHaveBeenCalledWith('/skill:mpx-execute {{artifact_url}}')
  })

  it('cancels an edited template on Escape without suppressing later blur saves', () => {
    const onSave = vi.fn()
    render(
      <AgentLinkedWorkItemPromptTemplateInput
        template="/skill:mpx-execute {{artifact_url}}"
        onSave={onSave}
      />
    )

    const input = screen.getByRole('textbox')
    input.focus()
    expect(input).toBe(document.activeElement)
    fireEvent.change(input, { target: { value: 'edited template' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(input).not.toBe(document.activeElement)
    expect(input instanceof HTMLTextAreaElement ? input.value : null).toBe(
      '/skill:mpx-execute {{artifact_url}}'
    )
    expect(onSave).not.toHaveBeenCalled()

    input.focus()
    fireEvent.change(input, { target: { value: 'later template' } })
    fireEvent.blur(input)

    expect(onSave).toHaveBeenCalledOnce()
    expect(onSave).toHaveBeenCalledWith('later template')
  })

  it('resets a configured template to the default behavior', () => {
    const onSave = vi.fn()
    render(
      <AgentLinkedWorkItemPromptTemplateInput
        template="/skill:mpx-execute {{artifact_url}}"
        onSave={onSave}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    expect(onSave).toHaveBeenCalledWith('')
    const input = screen.getByRole('textbox')
    expect(input instanceof HTMLTextAreaElement ? input.value : null).toBe('')
  })
})
