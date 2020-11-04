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

  update(html: string, position: string = TooltipPosition.Top, x?: number, y?: number) {
    const tX = x !== undefined ? x : d3.event.pageX
    const tY = y !== undefined ? y : d3.event.pageY
    this.tooltip
      .style('left', tX + 'px')
      .style('top', tY + 'px')
      .transition()
      .duration(100)
      .style('opacity', 1)

    this.tooltipText
      .attr('class', `tooltiptext ${position}`)
      .html(html)
  }

  hide(d: any) {
    this.tooltip
      .transition()
      .duration(50)
      .style('opacity', 0)
  }
}









