import { TooltipPosition } from '../Tooltip/tooltip.js'

export interface TooltipPlacement {
  x: number
  y: number
  position: TooltipPosition
}

export interface TooltipPlacementInput {
  x: number
  y: number
  preferredPosition: TooltipPosition
  containerWidth: number
  containerHeight: number
  tooltipWidth: number
  tooltipHeight: number
}

function clampValue(value: number, min: number, max: number): number {
  if (min > max) {
    return min
  }
  return Math.max(min, Math.min(max, value))
}

export function calculateTooltipPlacement(input: TooltipPlacementInput): TooltipPlacement {
  const { x, y, preferredPosition, containerWidth, containerHeight, tooltipWidth, tooltipHeight } =
    input
  const gap = 6
  const padding = 8

  let position = preferredPosition

  if (position === TooltipPosition.Right && x + tooltipWidth + gap + padding > containerWidth) {
    position = TooltipPosition.Left
  } else if (position === TooltipPosition.Left && x - tooltipWidth - gap - padding < 0) {
    position = TooltipPosition.Right
  } else if (
    position === TooltipPosition.Bottom &&
    y + tooltipHeight + gap + padding > containerHeight
  ) {
    position = TooltipPosition.Top
  }

  let adjustedX
  let adjustedY

  if (position === TooltipPosition.Top || position === TooltipPosition.Bottom) {
    adjustedX = clampValue(
      x,
      tooltipWidth / 2 + padding,
      containerWidth - tooltipWidth / 2 - padding,
    )
    if (position === TooltipPosition.Top) {
      adjustedY = clampValue(y, tooltipHeight + gap + padding, containerHeight - padding)
    } else {
      adjustedY = clampValue(y, padding, containerHeight - tooltipHeight - gap - padding)
    }
  } else {
    adjustedY = clampValue(
      y,
      tooltipHeight / 2 + padding,
      containerHeight - tooltipHeight / 2 - padding,
    )
    if (position === TooltipPosition.Right) {
      adjustedX = clampValue(x, padding, containerWidth - tooltipWidth - gap - padding)
    } else {
      adjustedX = clampValue(x, tooltipWidth + gap + padding, containerWidth - padding)
    }
  }

  return { x: adjustedX, y: adjustedY, position }
}
