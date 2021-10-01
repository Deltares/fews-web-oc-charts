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

    // find values
    const traces = this.trace || this.axis.charts.map((chart) => { return chart.id })
    const points = []
    for (const chartId of traces ) {
      const chart = axis.charts.find(chart => chart.id === chartId)
      points.push(this.findNearestPoint(chart, xPos))
    }

    this.updateDataPoints(points)
    this.updateLabels(points)
    return
  }

  start(event): void {
    const axisIndex = this.options.x.axisIndex
    const scale = this.axis.xScale[axisIndex]
    this.value = scale.invert(event.x)
    this.group
      .append('text')
      .classed('date-label', true)
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
    this.group.select('.date-label').remove()
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
      .select('.date-label')
      .attr('x', xPos)
      .text(timeString)
    // handle
    this.group.select('polygon').attr('transform', 'translate(' + xPos + ',' + this.axis.height + ')')
  }


  updateDataPoints (points): void {
    this.group.select('.data-point-per-line')
      .selectAll('circle')
      .data(points)
      .join('circle')
      .filter((d) => d.y !== undefined)
      .attr('data-point-id', d => d.id)
      .attr('r', 3)
      .style('fill', (d: any) => {
        const selector = `[data-chart-id="${d.id}"]`
        const element = this.axis.chartGroup.select(selector).select('path')
        if (element.node() === null ) return
        const stroke = window
          .getComputedStyle(element.node() as Element)
          .getPropertyValue('stroke')
        return stroke
      })
      .style('stroke-width', '1px')
      .style('opacity', '1')
      .attr('transform', (d: any) => `translate( ${d.x}, ${d.y})`)
  }

  updateLabels(points): void {
    // const traces = this.trace || this.axis.charts.map( (chart) => {return chart.id})
    const nodes = []
    const links = []
    const labelLinks = []


    let i = 0
    for (const p of points) {
      if (p.y === undefined) continue
      // label
      nodes.push({ x: p.x, y: p.y, height: 50, width: 50, label: p.d })
      // point
      nodes.push({ fx: p.x0, fy: p.y0 })
      nodes.push({ fx: p.x, fy: p.y })
      nodes.push({ fx: p.x1, fy: p.y1 })
      // links.push({ source: i + 1, target: i})
      links.push({ source: i + 2, target: i, label: p.d })
      // links.push({ source: i + 3, target: i})
      // for (let s = 0 ; s < i; s = s + 4 ) {
      //   labelLinks.push({ source: s, target: i + 2 })
      // }
      i = i + 4
    }


    const link = this.group
      .selectAll(".link")
      .data(links)
      .join("line")
      .classed("link", true)

    const labels = this.group.selectAll(".label")
      .data(nodes)
      .join("text")
      .filter( (d) => d.label )
      .classed("label", true)

    const node = this.group
      .selectAll(".node")
      .data(nodes)
      .join("circle")
      .attr("r", 2)
      .classed("node", true)

    function tick(): void {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);
      node
        .attr("cx", d => d.x)
        .attr("cy", d => d.y)
      labels
        .attr("x", d => d.x)
        .attr("y", d => d.y)
        .attr("text-anchor", "middle")
        .attr("domina-baseline", "middle")
        .text(d => d.label)
    }

    const simulation = d3
      .forceSimulation()
      .nodes(nodes)
      .force("charge", d3.forceManyBody().strength(-100))
      .force("center", d3.forceCollide(10))
      .force("link", d3.forceLink(links).distance(20))
      .on("tick", tick);

    simulation.tick(100);
  }

  limitValue(): void {
    const axisIndex = this.options.x.axisIndex
    const axis = this.axis
    const scale = axis.xScale[axisIndex]
    let xPos = scale(this.value)
    xPos = (xPos === undefined) ? scale.range()[1] : xPos
    xPos = Math.min(xPos, scale.range()[1])
    xPos = Math.max(xPos, scale.range()[0])
  }

  findNearestPoint(chart, xPos): any {
    const axis = this.axis
    const xIndex = chart.axisIndex.x.axisIndex
    const xScale = axis.xScale[xIndex]
    const yIndex = chart.axisIndex.y.axisIndex
    const yScale = axis.yScale[yIndex]
    const xKey = chart.dataKeys.x
    const yKey = chart.dataKeys.y
    const bisect = d3.bisector(function (d: any) {
      return d[xKey]
    }).left

    const xValue = xScale.invert(xPos)
    const data = chart.data
    let idx = bisect(data, xValue)
    if ( idx === -1) {
      return { id: chart.id, x: undefined, y: undefined }
    }
    // find closest point to left of line
    const s = 3
    const x0 = xScale(data[idx-s][xKey])
    const x = xScale(data[idx][xKey])
    const x1 = xScale(data[idx+s][xKey])


    // get corresponding y-value
    const y0 = yScale(data[idx-s][yKey])
    const y = yScale(data[idx][yKey])
    const y1 = yScale(data[idx+s][yKey])
    const d = data[idx]
    return { id: chart.id, x0, x, x1, y0, y, y1, d: d[yKey]}
  }

}
