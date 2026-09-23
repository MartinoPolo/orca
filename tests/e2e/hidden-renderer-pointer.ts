import type { Locator, Page } from '@stablyai/playwright-test'

type PointerTarget = {
  x: number
  y: number
}

type PointerTargetSample = PointerTarget & {
  top: number
  right: number
  bottom: number
  left: number
  width: number
  height: number
}

const STABILITY_SAMPLE_DELAY_MS = 50
const STABILITY_TOLERANCE_PX = 0.5

export async function clickHiddenRendererPointer(page: Page, target: Locator): Promise<void> {
  // A CDP capture refreshes hidden-renderer layout and hit testing without mapping the window.
  await page.screenshot({ type: 'png' })
  const matchCount = await target.count()
  if (matchCount !== 1) {
    throw new Error(`Hidden renderer pointer requires exactly one target; found ${matchCount}`)
  }

  const point = await target.evaluate(
    async (element, { delayMs, tolerancePx }): Promise<PointerTarget> => {
      const validateTarget = (): PointerTargetSample => {
        if (!element.isConnected) {
          throw new Error('Hidden renderer pointer target is detached')
        }

        const style = window.getComputedStyle(element)
        if (style.display === 'none' || style.visibility !== 'visible') {
          throw new Error('Hidden renderer pointer target is not CSS-visible')
        }
        if (element instanceof HTMLButtonElement && element.disabled) {
          throw new Error('Hidden renderer pointer target is disabled')
        }
        if (element.closest('[aria-disabled="true"], [inert]')) {
          throw new Error('Hidden renderer pointer target has a disabled or inert ancestor')
        }

        const rect = element.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) {
          throw new Error('Hidden renderer pointer target has no rendered area')
        }

        const visibleLeft = Math.max(0, rect.left)
        const visibleTop = Math.max(0, rect.top)
        const visibleRight = Math.min(window.innerWidth, rect.right)
        const visibleBottom = Math.min(window.innerHeight, rect.bottom)
        if (visibleRight <= visibleLeft || visibleBottom <= visibleTop) {
          throw new Error('Hidden renderer pointer target has no in-viewport area')
        }

        return {
          x: (visibleLeft + visibleRight) / 2,
          y: (visibleTop + visibleBottom) / 2,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
          height: rect.height
        }
      }

      const initialRect = element.getBoundingClientRect()
      if (
        initialRect.left < 0 ||
        initialRect.top < 0 ||
        initialRect.right > window.innerWidth ||
        initialRect.bottom > window.innerHeight
      ) {
        element.scrollIntoView({ block: 'center', inline: 'center' })
      }

      const first = validateTarget()
      await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs))
      const second = validateTarget()
      for (const property of ['top', 'right', 'bottom', 'left', 'width', 'height'] as const) {
        if (Math.abs(first[property] - second[property]) > tolerancePx) {
          throw new Error('Hidden renderer pointer target moved between stability samples')
        }
      }

      const hit = document.elementFromPoint(second.x, second.y)
      if (!hit || !element.contains(hit)) {
        const obstruction = hit
          ? `${hit.tagName.toLowerCase()}${hit.getAttribute('role') ? `[role="${hit.getAttribute('role')}"]` : ''}${hit.id ? `#${hit.id}` : ''}${hit.getAttribute('class') ? `.${hit.getAttribute('class')}` : ''}`
          : 'nothing'
        throw new Error(
          `Hidden renderer pointer target is obstructed at its center: ${element.tagName.toLowerCase()}.${element.getAttribute('class') ?? ''} by ${obstruction}`
        )
      }

      return { x: second.x, y: second.y }
    },
    { delayMs: STABILITY_SAMPLE_DELAY_MS, tolerancePx: STABILITY_TOLERANCE_PX }
  )

  await page.mouse.click(point.x, point.y)
  // Flush application requestAnimationFrame work scheduled by the pointer event.
  await page.screenshot({ type: 'png' })
}
