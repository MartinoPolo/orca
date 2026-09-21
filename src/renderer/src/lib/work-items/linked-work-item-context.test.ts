import { describe, expect, it } from 'vitest'
import {
  buildContainedLinkedContextBlock,
  resolveQuickCreateLinkedWorkItemPrompt
} from './linked-work-item-context'

describe('contained linked context block', () => {
  it('escapes terminal and unicode format controls from linked context source data', () => {
    const tagLatinSmallLetterA = String.fromCodePoint(0xe0061)
    const block = buildContainedLinkedContextBlock({
      provider: 'linear',
      version: 1,
      renderedText: `before\u001b[201~after\u0007\tindent\u202Ehidden\u200Btag${tagLatinSmallLetterA}\u00AD\u180E\uFFF9`
    })

    expect(block).toContain('before\\x1B[201~after\\x07  indent\\x202Ehidden\\x200Btag\\xE0061')
    expect(block).toContain('\\xAD\\x180E\\xFFF9')
    expect(block).not.toContain('\u001b[201~')
    expect(block).not.toContain('\u0007')
    expect(block).not.toContain('\u202E')
    expect(block).not.toContain('\u200B')
    expect(block).not.toContain('\u00AD')
    expect(block).not.toContain('\u180E')
    expect(block).not.toContain('\uFFF9')
    expect(block).not.toContain(tagLatinSmallLetterA)
  })
})

describe('linked work-item prompt templates', () => {
  it('preserves default formatting for blank templates', () => {
    expect(
      resolveQuickCreateLinkedWorkItemPrompt(
        { number: 42, url: 'https://github.com/acme/repo/issues/42' },
        '  note  ',
        '   '
      )
    ).toEqual({
      prompt: '',
      draftPrompt: 'note\n\nhttps://github.com/acme/repo/issues/42'
    })
  })

  it('formats every artifact URL placeholder without replacement-string semantics', () => {
    expect(
      resolveQuickCreateLinkedWorkItemPrompt(
        { number: 42, url: '  https://example.com/issues/$&42  ' },
        '  investigate first  ',
        '/skill:mpx-execute {{artifact_url}} then {{artifact_url}}'
      )
    ).toEqual({
      prompt: '',
      draftPrompt:
        'investigate first\n\n/skill:mpx-execute https://example.com/issues/$&42 then https://example.com/issues/$&42'
    })
  })

  it('allows a literal configured template and requires a linked URL', () => {
    expect(
      resolveQuickCreateLinkedWorkItemPrompt(
        { number: 42, url: 'https://github.com/acme/repo/issues/42' },
        '',
        'Use the linked tracker workflow'
      )
    ).toEqual({ prompt: '', draftPrompt: 'Use the linked tracker workflow' })
    expect(
      resolveQuickCreateLinkedWorkItemPrompt(
        { provider: 'linear', number: 0, url: '' },
        '  typed fallback  ',
        '/skill:mpx-execute {{artifact_url}}'
      )
    ).toEqual({ prompt: 'typed fallback', draftPrompt: null })
  })
})
