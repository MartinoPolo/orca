import { expect, it } from 'vitest'
import { createTestStore } from '@/store/slices/store-test-helpers'

it('constructs the renderer store after terminal slices are imported by test consumers', async () => {
  const { useAppStore } = await import('@/store')

  expect(createTestStore().getState().tabsByWorktree).toEqual({})
  expect(useAppStore.getState().tabsByWorktree).toEqual({})
})
