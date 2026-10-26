import { expect, test } from 'vitest'
import { reactive, withSource } from '../../src/core/runtime.js'
import {
  linearScale,
  timeScale,
  pauseScaleAutoscale,
  registerScaleExtents,
} from '../../src/scales/scale.js'

test.each(['domain', 'autoscale'] as const)(
  'holds the resolved domain exactly until %s is explicitly updated',
  (reset) => {
    const extent = reactive.signal<readonly [number, number]>([12, 83])
    const scale = linearScale({ autoscale: 'visible', padding: 0.1, nice: true })
    const disconnect = registerScaleExtents(scale, () => extent.get())
    try {
      const original = scale.domain.get()
      pauseScaleAutoscale(scale)
      expect(scale.domain.get()).toEqual(original)
      extent.set([30, 40])
      expect(scale.domain.get()).toEqual(original)
      scale.update({ reverse: true })
      expect(scale.domain.get()).toEqual(original)
      if (reset === 'domain') scale.update({ domain: undefined })
      else scale.update({ autoscale: 'visible' })
      expect(scale.domain.get()).toEqual([29, 41])
    } finally {
      disconnect()
    }
  },
)

test('holding an inactive following scale preserves its viewport and reset resumes follow', () => {
  const extent = reactive.signal<readonly [number, number]>([1000, 2000])
  const scale = timeScale({ follow: { window: 500 }, padding: 0.1 })
  const disconnect = registerScaleExtents(scale, () => extent.get())
  try {
    const original = scale.domain.get()
    withSource('zoom', () => pauseScaleAutoscale(scale))
    expect(scale.following.get()).toBe(false)
    extent.set([1000, 3000])
    expect(scale.domain.get()).toEqual(original)
    withSource('reset', () => scale.update({ domain: undefined }))
    expect(scale.following.get()).toBe(true)
    expect(scale.domain.get()).toEqual([2450, 3050])
    pauseScaleAutoscale(scale)
    extent.set([1000, 4000])
    scale.resumeFollow()
    expect(scale.domain.get()).toEqual([3450, 4050])
  } finally {
    disconnect()
  }
})
