import * as d3 from 'd3'
import { Axes } from '../Axes/axes.js'
import { CartesianAxes } from '../index.js';
import { Visitor } from './visitor.js'
import { defaultsDeep } from 'lodash-es'
import { bboxCollide } from '../Utils/bboxCollide.js'

type CrossSectionSelectOptions = {
  x: { axisIndex: number };
  draggable: boolean;
}

export class CrossSectionSelect implements Visitor {
  private trace: string[]
  private group: any
  private backGroup: any
  private frontGroup: any
  private pointRadius = 3
  private simulation: d3.Simulation<any, any>
  private axis: CartesianAxes
  value: number | Date
  currentData: any
  callback: (value: number | Date) => void
  format: (n: number | { valueOf(): number; } | Date) => string
  private options: CrossSectionSelectOptions = {
    x: { axisIndex: 0 },
    draggable: false
  }
  private visible: boolean

  // use shared Visitor constuctor (Visitor should be a abstract class)
  constructor(value: number | Date, callback: (value: number | Date) => void, options: CrossSectionSelectOptions, trace?: string[]) {
    this.value = value
    this.callback = callback
    this.format = d3.format('.2f')
    this.options = defaultsDeep(options,
      this.options
    ) as CrossSectionSelectOptions
    this.trace = trace
    this.visible = true
  }

  visit(axis: Axes): void {
    this.axis = axis as CartesianAxes
    this.create(axis as CartesianAxes)
  }

  create(axis: CartesianAxes): void {
    this.group = axis.canvas.insert('g', '.mouse')
      .attr('class', 'cross-section-select')
      .attr('font-family', 'sans-serif')
      .attr('fill', 'currentColor')

    this.backGroup = this.group.append('g')
    this.frontGroup = this.group.append('g')
    this.backGroup.append('line')

    const handle = this.backGroup
      .append('polygon')
      .attr('points', '0,0 -5,5 -5,8 5,8 5,5')
      .attr('class', 'cross-section-select-handle')

    if (this.options.draggable) {
      handle
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
    }

    this.frontGroup.append('g').attr('class', 'data-point-per-line')
    this.redraw()
  }

  redraw(): void {
    const axis = this.axis
    const axisIndex = this.options.x.axisIndex
    const scale = axis.xScales[axisIndex]
    const domain = scale.domain()
    const xPos = scale(this.value)
    this.visible = (this.value >= domain[0] && this.value <= domain[1])
    this.updateLine(xPos)
    // find values
    const traces = this.trace || this.axis.charts.map((chart) => { return chart.id })
    let points = []
    const styles: Record<string, CSSStyleDeclaration> = {}
    for (const chart of this.axis.charts) {
      if (traces.includes(chart.id) && chart.visible) {
        points.push(this.findNearestPoint(chart, xPos))
        styles[chart.id] = this.styleForChart(chart.id)
      }
    }
    this.currentData = points.map((p) => {
      return {
        id: p.id, data: p.d, value: p.value
      }
    })
    points = points.filter((p) => p.y !== undefined)
    this.updateLabels(points, styles)
    this.updateDataPoints(points, styles)
  }

  start(event): void {
    const axisIndex = this.options.x.axisIndex
    const scale = this.axis.xScales[axisIndex]
    this.value = scale.invert(event.x)
    this.backGroup
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
    const scale = this.axis.xScales[axisIndex]
    this.value = scale.invert(event.x)
    this.limitValue()
    this.redraw()
  }

  end(): void {
    this.backGroup.select('.date-label').remove()
    if (typeof this.callback === 'function') {
      this.callback(this.value)
    }
  }

  styleForChart(id) {
    const selector = `[data-chart-id="${id}"]`
    const element = this.axis.chartGroup.select(selector).select('path')
    if (element.node() === null) return
    return window
      .getComputedStyle(element.node() as Element)
  }

  updateLine(xPos: number): void {
    const visibility = this.visible ? 'visible' : 'hidden'
    // line
    this.backGroup
      .select('line')
      .attr('y1', 0)
      .attr('y2', this.axis.height)
      .attr('transform', 'translate(' + xPos + ', 0)')
      .style('visibility', visibility)
    // text
    const timeString = this.format(this.value)
    this.backGroup
      .select('.date-label')
      .attr('x', xPos)
      .text(timeString)
      .style('visibility', visibility)
    // handle
    this.backGroup.select('polygon')
      .attr('transform', 'translate(' + xPos + ',' + this.axis.height + ')')
      .style('visibility', visibility)
  }


  updateDataPoints(points, styles): void {
    const visibility = this.visible ? 'visible' : 'hidden'
    this.frontGroup.selectAll('.data-point-per-line')
      .selectAll('circle')
      .data(points)
      .join('circle')
      .filter((d) => d.y !== undefined)
      .attr('data-point-id', d => d.id)
      .attr('r', this.pointRadius)
      .style('fill', (d) => {
        const style = styles[d.id]
        return style.getPropertyValue('stroke')
      })
      .style('visibility', visibility)
      .style('stroke-width', '1px')
      .style('opacity', '1')
      .attr('transform', (d) => `translate( ${d.x}, ${d.y})`)
  }

  updateLabels(points, styles): void {
    const nodes = []
    const links = []
    let i = 0
    let j = 0
    const sortedPoint = [...points].sort((a, b) => a.y - b.y)

    const centerY = sortedPoint.reduce((total, p) => { return total + p.y }, 0) / sortedPoint.length
    for (const p of sortedPoint) {
      if (p.y === undefined) continue
      nodes.push({ id: p.id, fx: p.x + 50, y: p.y + Math.random() / 10, py: p.y, label: p.value, width: 100, height: 20 })
      // nodes.push({ id: p.id, fx: p.x + 50, x: p.x + 1000, y: (j - sortedPoint.length / 2) * 20 + centerY, py: p.y, label: p.value })
      nodes.push({ fx: p.x, fy: p.y, width: 4, height: 4 })
      links.push({ source: nodes[i + 1], target: nodes[i], label: p.value })
      j = j + 1
      i = i + 2
    }

    const visibility = this.visible ? 'visible' : 'hidden'

    const rectSelection = this.frontGroup.selectAll(".back")
      .data(nodes.filter((d) => d.label !== undefined))

    const rectsUpdate = rectSelection
      .join("rect")
      .classed("back", true)
      .attr("fill", "rgb(0, 0 , 0)")
      .attr("stroke", "none")
      .style('visibility', visibility)

    const labelsSelection = this.frontGroup.selectAll(".label")
      .data(nodes.filter((d) => d.label !== undefined))

    const labelsUpdate = labelsSelection
      .join("text")
      .classed("label", true)
      .attr("dominant-baseline", "middle")
      .attr('fill', (d) => {
        const style = styles[d.id]
        return style
          .getPropertyValue('stroke')
      })
      .style('visibility', visibility)
      .attr('stroke', 'none')
      .text(d => d.label)

    const link = this.backGroup
      .selectAll(".link")
      .data(links)
      .join("line")
      .style('visibility', visibility)
      .classed("link", true)


    const widths = [], heights = []
    const margin = 2
    const radius = 2 * this.pointRadius
    labelsUpdate.each(function (this) {
      const height = this.getBoundingClientRect().height + 2 * margin
      heights.push(height)
      heights.push(radius)
      const width = this.getBoundingClientRect().width + height
      widths.push(width)
      widths.push(radius)
    })

    rectsUpdate
      .attr("rx", (d, j) => heights[2 * j] / 2)
      .attr("ry", (d, j) => heights[2 * j] / 2)
      .attr("width", (d, j) => widths[2 * j])
      .attr("height", (d, j) => heights[2 * j])

    const tick = (): void => {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);
      rectsUpdate
        .attr("x", (d, j) => d.x - heights[2 * j] / 2)
        .attr("y", (d, j) => d.y - heights[2 * j] / 2)
      labelsUpdate
        .attr("x", d => d.x)
        .attr("y", d => d.y)
    }

    if (this.simulation !== undefined) this.simulation.stop()

    const collisionForce = bboxCollide(function (d, j) {
      let bbox
      if (d.label !== undefined) {
        bbox = [[- heights[j] / 2, - heights[j] / 2], [widths[j] - heights[j] / 2, heights[j] / 2]]
      } else {
        bbox = [[- widths[j] / 2, -heights[j] / 2], [widths[j] / 2, heights[j] / 2]]
      }
      return bbox
    })

    this.simulation = d3
      .forceSimulation()
      .alphaDecay(0.01)
      .nodes(nodes)
      .force("center", collisionForce)
      .on("tick", tick)
    this.simulation.stop()
    this.simulation.tick(50)
    tick()
    // this.simulation.restart()
  }

  limitValue(): boolean {
    const axisIndex = this.options.x.axisIndex
    const axis = this.axis
    const scale = axis.xScales[axisIndex]
    const domain = scale.domain()
    if (this.value < domain[0]) {
      this.value = domain[0]
      return true
    } else if (this.value > domain[1]) {
      this.value = domain[1]
      return true
    }
    return false
  }

  findNearestPoint(chart, xPos): { id: string; x: number; y: number; value?: string, d: any } {
    const axis = this.axis
    if (chart.data.length < 2) return { id: chart.id, x: undefined, y: undefined, d: undefined }
    const xIndex = chart.axisIndex.x.axisIndex
    const xScale = axis.xScales[xIndex]
    const yIndex = chart.axisIndex.y.axisIndex
    const yScale = axis.yScales[yIndex]
    const xKey = chart.dataKeys.x
    const yKey = chart.dataKeys.y
    const data = chart.data
    const bisect = d3.bisector(function (datum) {
      return datum[xKey]
    }).left

    const xValue = xScale.invert(xPos)
    let idx = bisect(data, xValue)
    if (idx < 0) return { id: chart.id, x: undefined, y: undefined, d: undefined }
    idx = Math.min(idx, data.length - 1)
    let yValue = data[idx][yKey]
    // look back
    if (yValue === null) {
      for (let i = idx; i >= 0; i--) {
        yValue = data[i][yKey]
        if (yValue !== null) {
          idx = i
          break
        }
      }
    }
    const x = xScale(data[idx][xKey])
    const y = yScale(data[idx][yKey])
    const yExtent = this.axis.extent.y
    const s = d3.formatSpecifier("f")
    s.precision = d3.precisionFixed((yExtent[1] - yExtent[0]) / 100)
    const d = data[idx]
    if (yValue === null || yValue < yScale.domain()[0] || yValue > yScale.domain()[1]) {
      return { id: chart.id, x: undefined, y: undefined, d }
    }
    return { id: chart.id, x, y, value: d3.format(s.toString())(d[yKey]), d }
  }

}
