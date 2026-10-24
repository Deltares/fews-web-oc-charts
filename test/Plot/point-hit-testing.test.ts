import { describe, expect, test, vi } from 'vitest'
import { createSeries, linearScale, series } from '../../src/index.js'
import { reactive } from '../../src/core/runtime.js'
import { nearestPoint } from '../../src/plot/interaction/point-hit-testing.js'
import { bindScale } from '../../src/scales/scale.js'

describe('point hit-test indexes', () => {
  test('reuses a screen-space index for repeated pointer queries and invalidates on data changes', () => {
    const length = 10_000
    const data = createSeries({
      x: Float64Array.from({ length }, (_, index) => index),
      y: Float64Array.from({ length }, (_, index) => index % 10),
    })
    const mark = series(data, { x: 't', y: 'q' })
    const x = bindScale(
      linearScale({ domain: [0, length - 1] }),
      reactive.signal([0, 100] as const),
    )
    const y = bindScale(linearScale({ domain: [0, 10] }), reactive.signal([100, 0] as const))
    const xProject = vi.spyOn(x, 'project')
    const yProject = vi.spyOn(y, 'project')
    const scales = { t: x, q: y }
    const plot = { x: 0, y: 0, width: 100, height: 100 }

    expect(
      nearestPoint(mark, scales, { x: x.project(9990), y: y.project(0) }, 'xy', plot)?.index,
    ).toBe(9990)
    const indexedProjectionCount = xProject.mock.calls.length + yProject.mock.calls.length
    expect(indexedProjectionCount).toBeGreaterThan(length)

    expect(nearestPoint(mark, scales, { x: 50, y: 50 }, 'xy', plot)).toBeDefined()
    expect(xProject.mock.calls.length + yProject.mock.calls.length).toBe(indexedProjectionCount)

    data.replace({ x: [0, 1], y: [8, 9] })
    expect(nearestPoint(mark, scales, { x: 100, y: 10 }, 'xy', plot)?.index).toBe(1)
    expect(xProject.mock.calls.length + yProject.mock.calls.length).toBeGreaterThan(
      indexedProjectionCount,
    )
  })

  test('uses the nearest screen coordinate for one-axis inspection', () => {
    const mark = series(createSeries({ x: [0, 1, 2], y: [9, 1, 7] }), { x: 't', y: 'q' })
    const scales = {
      t: bindScale(linearScale({ domain: [0, 2] }), reactive.signal([0, 100] as const)),
      q: bindScale(linearScale({ domain: [0, 10] }), reactive.signal([100, 0] as const)),
    }
    const plot = { x: 0, y: 0, width: 100, height: 100 }

    expect(nearestPoint(mark, scales, { x: 49, y: 99 }, 'x', plot)?.index).toBe(1)
    expect(nearestPoint(mark, scales, { x: 49, y: 90 }, 'y', plot)?.index).toBe(1)
  })
})
