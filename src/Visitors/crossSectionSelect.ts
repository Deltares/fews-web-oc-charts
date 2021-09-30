import * as d3 from 'd3'
import { Axis, CartesianAxis } from '../Axis'
import { Visitor } from './visitor'
import defaultsDeep from 'lodash/defaultsDeep'


type CrossSectionSelectOptions = {
  x: { axisIndex: number };
}

export class CrossSectionSelect implements Visitor {
  trace: string[]
  group: any
  line: any
  axis: CartesianAxis
  value: number | Date
  callback: Function
  format: Function
  options: CrossSectionSelectOptions = {
    x: { axisIndex : 0 }
  }

  // use shared Visitor constuctor (Visitor should be a abstract class)
  constructor(value: number | Date, callback: Function, options: CrossSectionSelectOptions) {
    this.value = value
    this.callback = callback
    this.format = d3.format('.2f')
    this.options = defaultsDeep(this.options,
      options
    ) as CrossSectionSelectOptions
  }

  visit(axis: Axis): void {
    this.axis = axis as CartesianAxis
    this.create(axis as CartesianAxis)
  }

  create(axis: CartesianAxis): void {
    if (!this.group) {
      this.group = axis.canvas.append('g').attr('class', 'cross-section-select')
      this.group.append('line')
      this.group
        .append('polygon')
        .attr('points', '0,0 -5,5 -5,8 5,8 5,5')
        .attr('class', 'cross-section-select-handle')
        .call(
          d3
            .drag()
            .on('start', (event) => {
              this.start(event)
            })
            .on('drag', (event) => {
              this.drag(event)
            })
            .on('end', () => {
              this.end()
            })
        )
      this.group.append('g').attr('class', 'data-point-per-line')
    }
    this.redraw()
  }

  redraw(): void {
    const axis = this.axis
    const axisIndex = this.options.x.axisIndex
    const scale = axis.xScale[axisIndex]
    this.limitValue()
    const xPos = scale(this.value)
    this.updateLine(xPos)

    // handle
    // data points
    this.updateDataPoints()
    // determine closest data point for each line
    this.group.select('.data-point-per-line')
      .selectAll('circle')
      .attr('transform', function(d, i) {
        const selector = `[data-chart-id="${d}"]`
        const chart = axis.charts.find(chart => chart.id === d)
        const xIndex = chart.axisIndex.x.axisIndex
        const xScale = axis.xScale[xIndex]
        const yIndex = chart.axisIndex.y.axisIndex
        const yScale = axis.yScale[yIndex]
        const xKey = chart.dataKeys.x
        const yKey = chart.dataKeys.y
        const bisect = d3.bisector(function(d: any) {
          return d[xKey]
        }).left

        const element = axis.canvas.select(selector).select('path')
        if (element.node() === null) return 'translate(0,' + -window.innerHeight + ')'
        const style = window.getComputedStyle(element.node() as Element)
        if (style === null || style.getPropertyValue('visibility') === 'hidden') {
          return 'translate(0,' + -window.innerHeight + ')'
        }
        // let stroke = style.getPropertyValue('stroke')
        const datum = element.datum() as any
        if (datum === null || datum.length === 0) {
          return 'translate(0,' + -window.innerHeight + ')'
        }
        const xValue = xScale.invert(xPos)
        let idx = bisect(datum, xValue)
        // line before first point
        if (idx === 0 && datum[idx][xKey] >= xValue ) {
          return 'translate(0,' + -window.innerHeight + ')'
        }
        // empty data
        if (!datum[idx] || datum[idx][yKey] === null || datum[idx-1][yKey] === null) {
          return 'translate(0,' + -window.innerHeight + ')'
        }
        // find closest point to left of line
        let x0 = xPos
        const x1 = xScale(datum[idx-1][xKey])
        const x2 = xScale(datum[idx][xKey])
        if (x2 <= xPos) {
          x0 = x2
        } else {
          x0 = x1
          idx = idx -1
        }
        // point outside range
        if (x0 < xScale.range()[0] ) {
          return 'translate(0,' + -window.innerHeight + ')'
        }

        // get corresponding y-value
        const valy = datum[idx][yKey]
        let posy = yScale(valy)
        // outside range
        posy =
          posy < yScale.range()[1] || posy > yScale.range()[0]
            ? -window.innerHeight
            : posy

        return 'translate(' + x0 + ',' + posy + ')'
      })
  }

  start(event): void {
    const axisIndex = this.options.x.axisIndex
    const scale = this.axis.xScale[axisIndex]
    this.value = scale.invert(event.x)
    this.group
      .append('text')
      .attr('x', event.x)
      .attr('y', this.axis.height)
      .attr('dx', 10)
      .attr('dy', -5)
      .text(this.format(this.value))
    this.redraw()
  }

  drag(event): void {
    const axisIndex = this.options.x.axisIndex
    const scale = this.axis.xScale[axisIndex]
    this.value = scale.invert(event.x)
    this.redraw()
  }

  end(): void {
    this.group.select('text').remove()
    if (typeof this.callback === 'function') {
      this.callback(this.value)
    }
  }

  updateLine(xPos: number): void {
    // line
    const timeString = this.format(this.value)
    this.group
      .select('line')
      .attr('y1', 0)
      .attr('y2', this.axis.height)
      .attr('transform', 'translate(' + xPos + ', 0)')
    // text
    this.group
      .select('text')
      .attr('x', xPos)
      .text(timeString)
    // handle
    this.group.select('polygon').attr('transform', 'translate(' + xPos + ',' + this.axis.height + ')')
  }


  updateDataPoints (): void {
    const traces = this.trace || this.axis.charts.map( (chart) => {return chart.id})

    this.group.select('.data-point-per-line')
      .selectAll('circle')
      .data(traces)
      .join('circle')
      .attr('data-point-id', d => d)
      .attr('r', 3)
      .style('fill', (d: any) => {
        const selector = `[data-chart-id="${d}"]`
        const element = this.axis.chartGroup.select(selector).select('path')
        if (element.node() === null ) return
        const stroke = window
          .getComputedStyle(element.node() as Element)
          .getPropertyValue('stroke')
        return stroke
      })
      .style('stroke-width', '1px')
      .style('opacity', '1')
  }

  limitValue(): void {
    const axisIndex = this.options.x.axisIndex
    const axis = this.axis
    const scale = axis.xScale[axisIndex]
    let xPos = scale(this.value)
    xPos = (xPos === undefined) ? scale.range()[1] : xPos
    xPos = Math.min(xPos, scale.range()[1])
    xPos = Math.max(xPos, scale.range()[0])
    this.value = scale.invert(xPos)
  }

}
