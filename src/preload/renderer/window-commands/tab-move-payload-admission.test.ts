import { describe, expect, it } from 'vitest'
import { admitTabMovePayload } from './tab-move-payload-admission'

describe('admitTabMovePayload', () => {
  it.each(['left', 'right', 'up', 'down'] as const)(
    'admits %s with a nonempty source id',
    (direction) => {
      expect(admitTabMovePayload({ direction, sourceId: 'page-1' })).toEqual({
        direction,
        sourceId: 'page-1'
      })
    }
  )

  it.each([
    undefined,
    null,
    {},
    [],
    { direction: 'right' },
    { direction: 'diagonal', sourceId: 'page-1' },
    { direction: 'right', sourceId: '' },
    { direction: 'right', sourceId: 1 },
    'page-1'
  ])('rejects malformed payload %#', (payload) => {
    expect(admitTabMovePayload(payload)).toBeNull()
  })
})
