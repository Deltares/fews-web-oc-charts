import { describe, expect, test } from 'vitest'
import { TooltipPosition } from '../../src/Tooltip/tooltip.js'
import { getMouseOverDirectionStrategy } from '../../src/Utils/mouseOverDirection.js'

describe('getMouseOverDirectionStrategy', () => {
  test('returns horizontal strategy with expected defaults', () => {
    const strategy = getMouseOverDirectionStrategy('horizontal')

    expect(strategy.key).toBe('x')
    expect(strategy.inverseKey).toBe('y')
    expect(strategy.valueLabelSelector).toBe('.mouse-x text')
    expect(strategy.defaultTooltipPosition).toBe(TooltipPosition.Right)
    expect(strategy.createLinePath(200, 100)).toBe('M0,100 0,0')
    expect(strategy.tooltipBaseX([40, 12], 10, 'mouse')).toBe(50)
  })

  test('returns vertical strategy with expected defaults', () => {
    const strategy = getMouseOverDirectionStrategy('vertical')

    expect(strategy.key).toBe('y')
    expect(strategy.inverseKey).toBe('x')
    expect(strategy.valueLabelSelector).toBe('.mouse-y text')
    expect(strategy.defaultTooltipPosition).toBe(TooltipPosition.Top)
    expect(strategy.createLinePath(200, 100)).toBe('M200,0 0,0')
  })

  test('uses touch offset in vertical mode and mouse-follow for non-touch', () => {
    const strategy = getMouseOverDirectionStrategy('vertical')

    expect(strategy.tooltipBaseX([40, 12], 10, 'touch')).toBe(26)
    expect(strategy.tooltipBaseX([40, 12], 10, 'mouse')).toBe(50)
    expect(strategy.tooltipBaseX([40, 12], 10, 'pen')).toBe(50)
  })

  test('inverts pointer value using axis based on direction', () => {
    const horizontal = getMouseOverDirectionStrategy('horizontal')
    const vertical = getMouseOverDirectionStrategy('vertical')

    const xScale = { invert: (value: number) => value + 100 }
    const yScale = { invert: (value: number) => value + 200 }

    expect(horizontal.pointerValue([3, 4], xScale, yScale)).toBe(103)
    expect(vertical.pointerValue([3, 4], xScale, yScale)).toBe(204)
  })
})
