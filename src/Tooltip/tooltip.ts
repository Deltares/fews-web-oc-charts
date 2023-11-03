import * as d3 from 'd3'

export enum TooltipPosition {
  Top = 'top',
  Bottom = 'bottom',
  Left = 'left',
  Right = 'right',
}

export enum TooltipAnchor {
  Top = 'top',
  Bottom = 'bottom',
  Left = 'left',
  Right = 'right',
  Center = 'center',
  Pointer = 'pointer',
}

export class Tooltip {
  tooltip: any = null
  tooltipText: any = null
  container: HTMLElement
  isHidden = true

  constructor(container) {
    this.container = container
    this.createTooltip()
  }

  createTooltip() {
    this.tooltip = d3
      .select(this.container)
      .append('div')
      .attr('class', 'tooltip')
      .style('opacity', 0)
    this.tooltipText = this.tooltip
      .append('div')
      .attr('class', 'tooltiptext right')
  }

  show() {
    this.isHidden = false
    this.tooltip
      .transition()
      .duration(50)
      .style('opacity', 1)
  }

  update(htmlElement: HTMLElement, position: TooltipPosition, x: number, y: number) {
    this.tooltip
      .style('left', x + 'px')
      .style('top', y + 'px')
    this.tooltipText
      .attr('class', `tooltiptext ${position}`)
      .node().replaceChildren(htmlElement)
  }

  hide() {
    this.isHidden = true
    this.tooltip
      .transition()
      .duration(50)
      .style('opacity', 0)
  }
}









