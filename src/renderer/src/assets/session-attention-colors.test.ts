import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./main.css', import.meta.url), 'utf8')

function themeVariables(selector: ':root' | '.dark'): Record<string, string> {
  const escaped = selector === ':root' ? ':root' : '\\.dark'
  const body = new RegExp(`${escaped}\\s*\\{(?<body>[\\s\\S]*?)\\n\\}`).exec(css)?.groups?.body
  if (!body) {
    throw new Error(`missing ${selector} theme block`)
  }
  return Object.fromEntries(
    [...body.matchAll(/--(?<name>[\w-]+):\s*(?<value>#[\da-fA-F]{3,6});/g)].map((match) => [
      match.groups?.name ?? '',
      match.groups?.value ?? ''
    ])
  )
}

function luminance(hex: string): number {
  const expanded =
    hex.length === 4
      ? `#${hex
          .slice(1)
          .split('')
          .map((channel) => `${channel}${channel}`)
          .join('')}`
      : hex
  const channels = [1, 3, 5].map(
    (offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16) / 255
  )
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  )
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrast(first: string, second: string): number {
  const firstLuminance = luminance(first)
  const secondLuminance = luminance(second)
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  )
}

describe('session attention palette', () => {
  it('uses the approved priority fills and contrast-safe foregrounds in both themes', () => {
    const expected = {
      p1: { fill: '#1d4ed8', foreground: '#fff' },
      p2: { fill: '#15803d', foreground: '#fff' },
      p4: { fill: '#f59e0b', foreground: '#2b1800' },
      p5: { fill: '#dc2626', foreground: '#fff' }
    }
    for (const variables of [themeVariables(':root'), themeVariables('.dark')]) {
      for (const [priority, colors] of Object.entries(expected)) {
        expect(variables[`session-priority-${priority}`]).toBe(colors.fill)
        expect(variables[`session-priority-${priority}-foreground`]).toBe(colors.foreground)
        expect(contrast(colors.fill, colors.foreground)).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('keeps badge borders and working glyphs visible on adjacent surfaces', () => {
    const light = themeVariables(':root')
    const dark = themeVariables('.dark')
    for (const priority of ['p1', 'p2', 'p4', 'p5']) {
      expect(
        contrast(light[`session-priority-${priority}-border`], light.background)
      ).toBeGreaterThanOrEqual(3)
      expect(
        contrast(dark[`session-priority-${priority}-border`], dark.card)
      ).toBeGreaterThanOrEqual(3)
    }
    expect(light['session-status-working']).toBe('#a16207')
    expect(
      contrast(light['session-status-working'], light['worktree-sidebar'])
    ).toBeGreaterThanOrEqual(3)
  })

  it('keeps metadata readable on every attention tint', () => {
    const light = themeVariables(':root')
    const dark = themeVariables('.dark')
    expect(light['session-attention-metadata']).toBe('#525252')
    expect(dark['session-attention-metadata']).toBe('#e5e5e5')
    for (const tone of ['input', 'outcome', 'done']) {
      expect(
        contrast(light['session-attention-metadata'], light[`session-attention-${tone}-surface`])
      ).toBeGreaterThanOrEqual(4.5)
      expect(
        contrast(dark['session-attention-metadata'], dark[`session-attention-${tone}-surface`])
      ).toBeGreaterThanOrEqual(4.5)
    }
  })
})
