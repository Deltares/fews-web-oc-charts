import { TooltipPosition } from '../Tooltip/tooltip.js'

export type MouseOverDirectionMode = 'horizontal' | 'vertical'

export interface MouseOverDirectionStrategy {
  key: 'x' | 'y'
  inverseKey: 'x' | 'y'
  valueLabelSelector: '.mouse-x text' | '.mouse-y text'
  defaultTooltipPosition: TooltipPosition
  createLinePath: (width: number, height: number) => string
  pointerValue: (mouse: [number, number], xScale: any, yScale: any) => number | Date
  tooltipBaseX: (mouse: [number, number], marginLeft: number, pointerType: string | null) => number
}

const verticalStrategy: MouseOverDirectionStrategy = {
  key: 'y',
  inverseKey: 'x',
  valueLabelSelector: '.mouse-y text',
  defaultTooltipPosition: TooltipPosition.Top,
  createLinePath: (width: number) => `M${width},0 0,0`,
  pointerValue: (mouse: [number, number], _xScale: any, yScale: any) => yScale.invert(mouse[1]),
  tooltipBaseX: (mouse: [number, number], marginLeft: number, pointerType: string | null) =>
    pointerType === 'touch' ? marginLeft + 16 : mouse[0] + marginLeft,
}

const horizontalStrategy: MouseOverDirectionStrategy = {
  key: 'x',
  inverseKey: 'y',
  valueLabelSelector: '.mouse-x text',
  defaultTooltipPosition: TooltipPosition.Right,
  createLinePath: (_width: number, height: number) => `M0,${height} 0,0`,
  pointerValue: (mouse: [number, number], xScale: any, _yScale: any) => xScale.invert(mouse[0]),
  tooltipBaseX: (mouse: [number, number], marginLeft: number) => mouse[0] + marginLeft,
}

export function getMouseOverDirectionStrategy(
  mode: MouseOverDirectionMode,
): MouseOverDirectionStrategy {
  return mode === 'vertical' ? verticalStrategy : horizontalStrategy
}
