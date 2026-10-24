import { TooltipPosition } from '../Tooltip/tooltip.js'
import type { TooltipPlacement } from './tooltipPlacement.js'

export function positionTooltipArrow(
  element: HTMLDivElement,
  placement: TooltipPlacement,
  anchorX: number,
  anchorY: number,
) {
  let arrow = element.querySelector<HTMLSpanElement>('[data-tooltip-arrow]')
  if (!arrow) {
    arrow = document.createElement('span')
    arrow.dataset.tooltipArrow = ''
    arrow.setAttribute('aria-hidden', 'true')
    element.append(arrow)
  }
  const background = 'var(--fews-chart-tooltip-background, #fff)'
  const horizontal =
    placement.position === TooltipPosition.Left || placement.position === TooltipPosition.Right
  const offset = horizontal
    ? anchorY - placement.y + element.offsetHeight / 2
    : anchorX - placement.x + element.offsetWidth / 2
  Object.assign(arrow.style, {
    position: 'absolute',
    width: '0',
    height: '0',
    pointerEvents: 'none',
    border: '6px solid transparent',
    left: '',
    right: '',
    top: '',
    bottom: '',
    transform: horizontal ? 'translateY(-50%)' : 'translateX(-50%)',
  })
  if (horizontal) arrow.style.top = `${offset}px`
  else arrow.style.left = `${offset}px`
  switch (placement.position) {
    case TooltipPosition.Right:
      arrow.style.left = '-12px'
      arrow.style.borderRightColor = background
      break
    case TooltipPosition.Left:
      arrow.style.right = '-12px'
      arrow.style.borderLeftColor = background
      break
    case TooltipPosition.Top:
      arrow.style.bottom = '-12px'
      arrow.style.borderTopColor = background
      break
    case TooltipPosition.Bottom:
      arrow.style.top = '-12px'
      arrow.style.borderBottomColor = background
      break
  }
}
