import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

describe('community PR tracking', () => {
  it('restricts upstream project credentials to the upstream repository', () => {
    const workflow = parse(readFileSync('.github/workflows/track-community-prs.yaml', 'utf8'))
    expect(workflow.jobs['track-community-pr'].if).toBe("github.repository == 'stablyai/orca'")
  })
})
