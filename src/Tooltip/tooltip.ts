import * as d3 from 'd3'

export enum TooltipPosition {
  Top = 'top',
  Bottom = 'bottom',
  Left = 'left',
  Right = 'right',
}

export class Tooltip {
  tooltip: any = null
  tooltipText: any = null
  container: HTMLElement

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
    this.tooltip
      .transition()
      .duration(50)
      .style('opacity', 1)
  }

  update(html: string, position: string = TooltipPosition.Top, x?: number, y?: number) {
    const pointer = d3.pointer(this.container)
    const tX = x !== undefined ? x : pointer[0]
    const tY = y !== undefined ? y : pointer[1]
    this.tooltip
      .style('left', tX + 'px')
      .style('top', tY + 'px')
    this.tooltipText
      .attr('class', `tooltiptext ${position}`)
      .html(html)
  }

  hide() {
    this.tooltip
      .transition()
      .duration(50)
      .style('opacity', 0)
  }
}









