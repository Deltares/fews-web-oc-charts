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
  mouseGroup: any
  line: any
  simulation: d3.Simulation<any,any>
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
    this.mouseGroup = axis.canvas.select('.mouse-events')
    if (this.mouseGroup.size() === 0) {
      this.mouseGroup = axis.canvas
        .append('g')
        .attr('class', 'mouse-events')
        .append('rect')
        .attr('width', axis.width)
        .attr('height', axis.height)
        .attr('fill', 'none')
        .attr('pointer-events', 'all')
    }
    this.group = axis.canvas.insert('g', '.mouse-events').attr('class', 'cross-section-select')
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
    this.redraw()
  }

  redraw(): void {
    const axis = this.axis
    const axisIndex = this.options.x.axisIndex
    const scale = axis.xScale[axisIndex]
    const xPos = scale(this.value)
    this.updateLine(xPos)
    // find values
    const traces = this.trace || this.axis.charts.map((chart) => { return chart.id })
    let points = []
    for (const chartId of traces ) {
      const chart = axis.charts.find(chart => chart.id === chartId)
      points.push(this.findNearestPoint(chart, xPos))
    }
    points = points.filter( (p) => p.y !== undefined )
    this.updateLabels(points)
    this.updateDataPoints(points)
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
    this.limitValue()
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
    this.group.selectAll('.data-point-per-line')
      .selectAll('circle')
      .data(points)
      .join('circle')
      .filter((d) => d.y !== undefined)
      .attr('data-point-id', d => d.id)
      .attr('r', 3)
      .style('fill', (d) => {
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
      .attr('transform', (d) => `translate( ${d.x}, ${d.y})`)
  }

  updateLabels(points): void {
    // const traces = this.trace || this.axis.charts.map( (chart) => {return chart.id})
    const nodes = []
    const links = []

    let i = 0
    for (const p of points) {
      if (p.y === undefined) continue
      nodes.push({ id: p.id, fx: p.x + 50, y: p.y, height: 50, width: 50, label: p.value })
      nodes.push({ fx: p.x, fy: p.y })
      links.push({ source: i + 1, target: i, label: p.value })
      i = i + 2
    }

    const link = this.group
      .selectAll(".link")
      .data(links)
      .join("line")
      .classed("link", true)

    const rectSelection = this.group.selectAll(".back")
      .data(nodes.filter((d) => d.label) )

    const rectsUpdate = rectSelection
      .join("rect")
      .classed("back", true)
      .attr("fill", "rgb(0, 0 , 0)")
      .attr("stroke", "none")

    const labelsSelection = this.group.selectAll(".label")
      .data(nodes.filter((d) => d.label) )

    const labelsUpdate = labelsSelection
      .join("text")
      .classed("label", true)
      .attr("dominant-baseline", "middle")
      .attr('fill', (d) => {
        const selector = `[data-chart-id="${d.id}"]`
        const element = this.axis.chartGroup.select(selector).select('path')
        if (element.node() === null ) return
        const stroke = window
          .getComputedStyle(element.node() as Element)
          .getPropertyValue('stroke')
        return stroke
      })
      .attr('stroke', 'none')
      .text(d => d.label)

    let width = 0, height = 0
    labelsUpdate.each(function(this) {
      width = Math.max(width, this.getBoundingClientRect().width)
      height = Math.max(height, this.getBoundingClientRect().height)
    })

    const margin = 4
    height = height + 2 * margin
    width = width + height

    rectsUpdate
      .attr("rx", height / 2)
      .attr("ry", height / 2)
      .attr("width", width)
      .attr("height", height)

    const tick = (): void => {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);
      rectsUpdate
        .attr("x", d => d.x - height/2)
        .attr("y", d => d.y - height/2)
      labelsUpdate
        .attr("x", d => d.x)
        .attr("y", d => d.y)
    }

    if ( this.simulation !== undefined) this.simulation.stop()
    this.simulation = d3
      .forceSimulation()
      .alphaDecay(0.2)
      .nodes(nodes)
      .force("center", d3.forceCollide(height / 2))
      .force("link", d3.forceLink(links).distance(20))
      .on("tick", tick)
    this.simulation.tick(20)
  }

  limitValue(): boolean {
    const axisIndex = this.options.x.axisIndex
    const axis = this.axis
    const scale = axis.xScale[axisIndex]
    const domain = scale.domain()
    if ( this.value < domain[0]) {
      this.value = domain[0]
      return true
    } else if(this.value > domain[1]) {
      this.value = domain[1]
      return true
    }
    return false
  }

  findNearestPoint(chart, xPos): {id: string; x: number; y: number; value?: number} {
    const axis = this.axis
    const xIndex = chart.axisIndex.x.axisIndex
    const xScale = axis.xScale[xIndex]
    const yIndex = chart.axisIndex.y.axisIndex
    const yScale = axis.yScale[yIndex]
    console.log(chart)
    const xKey = chart.dataKeys.x
    const yKey = chart.dataKeys.y
    const data = chart.data
    const bisect = d3.bisector(function (d) {
      return d[xKey]
    }).left

    const xValue = xScale.invert(xPos)
    const idx = bisect(data, xValue)
    const yValue = data[idx][yKey]
    if (idx === -1 || yValue < yScale.domain()[0] || yValue > yScale.domain()[1]) {
      return { id: chart.id, x: undefined, y: undefined }
    }
    const x = xScale(data[idx][xKey])
    const y = yScale(data[idx][yKey])
    const d = data[idx]
    return { id: chart.id, x, y, value: d[yKey]}
  }

}
