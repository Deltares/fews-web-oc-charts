import * as d3 from 'd3'
import { Axis, CartesianAxis } from '../Axis'
import { Visitor } from './visitor'
import defaultsDeep from 'lodash/defaultsDeep'


type CrossSectionSelectOptions = {
  x : { axisIndex: number }
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

  visit(axis: Axis) {
    this.axis = axis as CartesianAxis
    this.create(axis as CartesianAxis)
  }

  create(axis: CartesianAxis) {
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
            .on('end', (event) => {
              this.end()
            })
        )
      this.group.append('g').attr('class', 'data-point-per-line')
    }
    this.setDataPoint()
    this.redraw()
  }

  redraw() {
    const axisIndex = this.options.x.axisIndex
    const axis = this.axis
    const scale = axis.xScale[axisIndex]
    let xPos = scale(this.value)
    xPos = (xPos === undefined) ? scale.range()[1] : xPos
    let timeString = this.format(this.value)
    // line
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
    // determine closest data point for each line
    this.group.select('.data-point-per-line')
      .selectAll('circle')
      .attr('transform', function(d, i) {
        const selector = `[data-chart-id="${d}"]`
        let chart = axis.charts.find(chart => chart.id === d)
        let xIndex = chart.axisIndex.x.axisIndex
        let xScale = axis.xScale[xIndex]
        let yIndex = chart.axisIndex.y.axisIndex
        let yScale = axis.yScale[yIndex]
        let xKey = chart.dataKeys.x
        let yKey = chart.dataKeys.y
        let bisect = d3.bisector(function(d: any) {
          return d[xKey]
        }).left

        let element = axis.canvas.select(selector).select('path')
        if (element.node() === null) return 'translate(0,' + -window.innerHeight + ')'
        let style = window.getComputedStyle(element.node() as Element)
        if (style === null || style.getPropertyValue('visibility') === 'hidden') {
          return 'translate(0,' + -window.innerHeight + ')'
        }
        // let stroke = style.getPropertyValue('stroke')
        let datum = element.datum() as any
        if (datum === null || datum.length === 0) {
          return 'translate(0,' + -window.innerHeight + ')'
        }
        const xValue = xScale.invert(xPos)
        let idx = bisect(datum, xValue)
        // before first point
        if (idx === 0 && datum[idx][xKey] >= xValue) {
          return 'translate(0,' + -window.innerHeight + ')'
        }
        // after last first point
        if (idx === datum.length-1 && xValue >= datum[idx][xKey]) {
          return 'translate(0,' + -window.innerHeight + ')'
        }
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

        // get corresponding y-value
        let valy = datum[idx][yKey]
        let posy = yScale(valy)

        // outside range
        posy =
          posy < yScale.range()[1] || posy > yScale.range()[0]
            ? -window.innerHeight
            : posy
          
        return 'translate(' + x0 + ',' + posy + ')'
      })
  }

  start(event) {
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

  drag(event) {
    const axisIndex = this.options.x.axisIndex
    const scale = this.axis.xScale[axisIndex]
    this.value = scale.invert(event.x)
    this.redraw()
  }

  end() {
    this.group.select('text').remove()
    if (typeof this.callback === 'function') {
      this.callback(this.value)
    }
  }

  setDataPoint () {
    let traces = (this.trace !== undefined)
    ? this.trace
    : this.axis.charts.map( (chart) => {return chart.id})

    this.group.select('.data-point-per-line')
      .selectAll('circle')
      .data(traces)
      .join('circle')
      .attr('data-point-id', d => d)
      .attr('r', 3)
      .style('fill', 'blue')
      .style('fill', (d: any, i) => {
        const selector = `[data-chart-id="${d}"]`
        let element = this.axis.chartGroup.select(selector).select('path')
        if (element.node() === null ) return
        let stroke = window
          .getComputedStyle(element.node() as Element)
          .getPropertyValue('stroke')
        return stroke
      })
      .style('stroke-width', '1px')
      .style('opacity', '1')
  }
}
