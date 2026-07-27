import { describe, expect, test } from 'vitest'
import { TooltipPosition } from '../../src/Tooltip/tooltip.js'
import { calculateTooltipPlacement } from '../../src/Utils/tooltipPlacement.js'

describe('calculateTooltipPlacement', () => {
  test('flips from right to left when overflowing container width', () => {
    const placement = calculateTooltipPlacement({
      x: 190,
      y: 100,
      preferredPosition: TooltipPosition.Right,
      containerWidth: 200,
      containerHeight: 200,
      tooltipWidth: 40,
      tooltipHeight: 20,
    })

    expect(placement.position).toBe(TooltipPosition.Left)
  })

  test('flips from left to right when overflowing container left edge', () => {
    const placement = calculateTooltipPlacement({
      x: 20,
      y: 100,
      preferredPosition: TooltipPosition.Left,
      containerWidth: 200,
      containerHeight: 200,
      tooltipWidth: 40,
      tooltipHeight: 20,
    })

    expect(placement.position).toBe(TooltipPosition.Right)
  })

  test('flips from bottom to top when overflowing container height', () => {
    const placement = calculateTooltipPlacement({
      x: 80,
      y: 190,
      preferredPosition: TooltipPosition.Bottom,
      containerWidth: 200,
      containerHeight: 200,
      tooltipWidth: 40,
      tooltipHeight: 30,
    })

    expect(placement.position).toBe(TooltipPosition.Top)
  })

  test('clamps top placement x and y within container bounds', () => {
    const placement = calculateTooltipPlacement({
      x: 2,
      y: 4,
      preferredPosition: TooltipPosition.Top,
      containerWidth: 120,
      containerHeight: 100,
      tooltipWidth: 50,
      tooltipHeight: 20,
    })

    expect(placement.position).toBe(TooltipPosition.Top)
    expect(placement.x).toBeGreaterThanOrEqual(33)
    expect(placement.y).toBeGreaterThanOrEqual(34)
  })
})