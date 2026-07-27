import * as d3 from 'd3'
import { Axes } from '../Axes/axes.js'
import { CartesianAxes, Chart } from '../index.js'
import { Visitor } from './visitor.js'
import { defaultsDeep } from 'lodash-es'
import { bboxCollide } from '../Utils/bboxCollide.js'

type CrossSectionSelectOptions = {
  x?: { axisIndex: number }
  draggable?: boolean
}

export class CrossSectionSelect<V extends number | Date> implements Visitor {
  private trace: string[] = []
  private group: any
  private backGroup: any
  private frontGroup: any
  private readonly pointRadius = 3
  private simulation?: d3.Simulation<any, any>
  private axis?: CartesianAxes
  value: V
  currentData: any
  callback: (value: V) => void
  format: (n: number | { valueOf(): number } | Date) => string
  private options: CrossSectionSelectOptions = {
    x: { axisIndex: 0 },
    draggable: false,
  }
  private visible: boolean
  private readonly touchHitboxSize = 36

  // use shared Visitor constuctor (Visitor should be a abstract class)
  constructor(
    value: V,
    callback: (value: V) => void,
    options: CrossSectionSelectOptions,
    trace?: string[],
  ) {
    this.value = value
    this.callback = callback
    this.format = d3.format('.2f')
    this.options = defaultsDeep(options, this.options) as CrossSectionSelectOptions
    this.setTrace(trace)
    this.visible = true
  }

  setTrace(trace?: string[]) {
    this.trace = trace || []
  }

  visit(axis: Axes): void {
    this.axis = axis as CartesianAxes
    this.create(axis as CartesianAxes)
  }

  private getAxisIndex(): number {
    return this.options.x?.axisIndex ?? 0
  }

  create(axis: CartesianAxes): void {
    this.group = axis.canvas
      .insert('g', '.mouse')
      .attr('class', 'cross-section-select')
      .attr('font-family', 'sans-serif')

    this.backGroup = this.group.append('g')
    this.frontGroup = this.group.append('g')
    this.backGroup.append('line')

    const isDraggable = this.options.draggable === true
    const handle = this.backGroup
      .append('g')
      .attr('class', 'cross-section-select-handle')
      .classed('is-draggable', isDraggable)
      .classed('is-disabled', !isDraggable)

    handle
      .append('polygon')
      .attr('points', '0,0 -6,6 -6,10 6,10 6,6')
      .attr('class', 'cross-section-select-handle-visual')

    // Keep the visual handle compact, but provide a larger transparent hitbox for touch.
    handle
      .append('rect')
      .attr('class', 'cross-section-select-handle-hitbox')
      .attr('x', -this.touchHitboxSize / 2)
      .attr('y', -this.touchHitboxSize / 2)
      .attr('width', this.touchHitboxSize)
      .attr('height', this.touchHitboxSize)

    if (isDraggable) {
      handle.style('touch-action', 'none')
      handle.call(
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
          }),
      )
    }

    this.frontGroup.append('g').attr('class', 'data-point-per-line')
    this.redraw()
  }

  redraw(): void {
    const axis = this.axis
    if (!axis) return
    const axisIndex = this.getAxisIndex()
    const scale = axis.xScales[axisIndex]
    const domain = scale.domain()
    const xPos = scale(this.value)
    this.visible = this.value >= domain[0] && this.value <= domain[1]
    this.updateLine(xPos)
    // find values
    const traces =
      this.trace ||
      axis.charts.map((chart) => {
        return chart.id
      })
    let points = []
    const styles: Record<string, CSSStyleDeclaration> = {}
    for (const chart of axis.charts) {
      if (traces.includes(chart.id) && chart.visible) {
        points.push(this.findNearestPoint(chart, xPos))
        const chartStyle = this.styleForChart(chart.id)
        if (chartStyle) {
          styles[chart.id] = chartStyle
        }
      }
    }
    this.currentData = points.map((p) => {
      return {
        id: p.id,
        data: p.d,
        value: p.value,
      }
    })
    points = points.filter((p) => p.y !== undefined)
    this.updateLabels(points, styles)
    this.updateDataPoints(points, styles)
  }

  start(event: any): void {
    event.sourceEvent?.preventDefault?.()
    const axisIndex = this.getAxisIndex()
    const axis = this.axis
    if (!axis) return
    const scale = axis.xScales[axisIndex]
    this.value = scale.invert(event.x)
    this.backGroup
      .append('text')
      .classed('date-label', true)
      .attr('x', event.x)
      .attr('y', axis.height)
      .attr('dx', 10)
      .attr('dy', -5)
      .text(this.format(this.value))
    this.redraw()
  }

  drag(event: any): void {
    event.sourceEvent?.preventDefault?.()
    const axisIndex = this.getAxisIndex()
    const axis = this.axis
    if (!axis) return
    const scale = axis.xScales[axisIndex]
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

  styleForChart(id: string): CSSStyleDeclaration | undefined {
    const axis = this.axis
    if (!axis) return undefined
    const selector = `[data-chart-id="${id}"]`
    const element = axis.chartGroup.select(selector).select('path')
    if (element.node() === null) return undefined
    return window.getComputedStyle(element.node() as Element)
  }

  updateLine(xPos: number): void {
    const axis = this.axis
    if (!axis) return
    const visibility = this.visible ? 'visible' : 'hidden'
    // line
    this.backGroup
      .select('line')
      .attr('y1', 0)
      .attr('y2', axis.height)
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
    this.backGroup
      .select('.cross-section-select-handle')
      .attr('transform', 'translate(' + xPos + ',' + axis.height + ')')
      .style('visibility', visibility)
  }

  updateDataPoints(points: any[], styles: Record<string, CSSStyleDeclaration>): void {
    const visibility = this.visible ? 'visible' : 'hidden'
    this.frontGroup
      .selectAll('.data-point-per-line')
      .selectAll('circle')
      .data(points)
      .join('circle')
      .filter((d: any) => d.y !== undefined)
      .attr('data-point-id', (d: any) => d.id)
      .attr('r', this.pointRadius)
      .style('fill', (d: any) => {
        const style = styles[d.id]
        return style.getPropertyValue('stroke')
      })
      .style('visibility', visibility)
      .style('stroke-width', '1px')
      .style('opacity', '1')
      .attr('transform', (d: any) => `translate( ${d.x}, ${d.y})`)
  }

  updateLabels(points: any[], styles: Record<string, CSSStyleDeclaration>): void {
    const nodes = []
    const links = []
    let i = 0
    let j = 0
    const sortedPoint = [...points].sort((a, b) => a.y - b.y)

    for (const p of sortedPoint) {
      if (p.y === undefined) continue
      nodes.push({
        id: p.id,
        fx: p.x + 50,
        y: p.y + Math.random() / 10,
        py: p.y,
        label: p.value,
        width: 100,
        height: 20,
      })
      // nodes.push({ id: p.id, fx: p.x + 50, x: p.x + 1000, y: (j - sortedPoint.length / 2) * 20 + centerY, py: p.y, label: p.value })
      nodes.push({ fx: p.x, fy: p.y, width: 4, height: 4 })
      links.push({ source: nodes[i + 1], target: nodes[i], label: p.value })
      j = j + 1
      i = i + 2
    }

    const visibility = this.visible ? 'visible' : 'hidden'

    const rectSelection = this.frontGroup
      .selectAll('.back')
      .data(nodes.filter((d: any) => d.label !== undefined))

    const rectsUpdate = rectSelection
      .join('rect')
      .classed('back', true)
      .attr('fill', 'rgb(0, 0 , 0)')
      .attr('stroke', 'none')
      .style('visibility', visibility)

    const labelsSelection = this.frontGroup
      .selectAll('.label')
      .data(nodes.filter((d: any) => d.label !== undefined))

    const labelsUpdate = labelsSelection
      .join('text')
      .classed('label', true)
      .attr('dominant-baseline', 'middle')
      .attr('fill', (d: any) => {
        const style = styles[d.id]
        return style.getPropertyValue('stroke')
      })
      .style('visibility', visibility)
      .attr('stroke', 'none')
      .text((d: any) => d.label)

    const link = this.backGroup
      .selectAll('.link')
      .data(links)
      .join('line')
      .style('visibility', visibility)
      .classed('link', true)

    const widths: number[] = [],
      heights: number[] = []
    const margin = 2
    const radius = 2 * this.pointRadius
    labelsUpdate.each(function (this: any) {
      const height = this.getBoundingClientRect().height + 2 * margin
      heights.push(height)
      heights.push(radius)
      const width = this.getBoundingClientRect().width + height
      widths.push(width)
      widths.push(radius)
    })

    rectsUpdate
      .attr('rx', (d: any, j: number) => heights[2 * j] / 2)
      .attr('ry', (d: any, j: number) => heights[2 * j] / 2)
      .attr('width', (d: any, j: number) => widths[2 * j])
      .attr('height', (d: any, j: number) => heights[2 * j])

    const tick = (): void => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)
      rectsUpdate
        .attr('x', (d: any, j: number) => d.x - heights[2 * j] / 2)
        .attr('y', (d: any, j: number) => d.y - heights[2 * j] / 2)
      labelsUpdate.attr('x', (d: any) => d.x).attr('y', (d: any) => d.y)
    }

    if (this.simulation !== undefined) this.simulation.stop()

    const collisionForce = bboxCollide(function (d: any, j: number) {
      let bbox
      if (d.label !== undefined) {
        bbox = [
          [-heights[j] / 2, -heights[j] / 2],
          [widths[j] - heights[j] / 2, heights[j] / 2],
        ]
      } else {
        bbox = [
          [-widths[j] / 2, -heights[j] / 2],
          [widths[j] / 2, heights[j] / 2],
        ]
      }
      return bbox
    })

    this.simulation = d3
      .forceSimulation()
      .alphaDecay(0.01)
      .nodes(nodes)
      .force('center', collisionForce)
      .on('tick', tick)
    this.simulation.stop()
    this.simulation.tick(50)
    tick()
    // this.simulation.restart()
  }

  limitValue(): boolean {
    const axisIndex = this.getAxisIndex()
    const axis = this.axis
    if (!axis) return false
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

  findNearestPoint(
    chart: Chart,
    xPos: number,
  ): { id: string; x?: number; y?: number; value?: string; d: any } {
    const axis = this.axis
    if (!axis || chart.data.length < 2) {
      return { id: chart.id, x: undefined, y: undefined, d: undefined }
    }
    const xIndex = chart.axisIndex?.x?.axisIndex
    const yIndex = chart.axisIndex?.y?.axisIndex
    if (xIndex === undefined || yIndex === undefined) {
      return { id: chart.id, x: undefined, y: undefined, d: undefined }
    }
    const xScale = axis.xScales[xIndex]
    const yScale = axis.yScales[yIndex]
    const xDataKey = chart.dataKeys?.x
    const yDataKey = chart.dataKeys?.y
    if (!xDataKey || !yDataKey) {
      return { id: chart.id, x: undefined, y: undefined, d: undefined }
    }
    const data = chart.data
    const bisector = d3.bisector((datum: any) => datum[xDataKey])

    const xValue = xScale.invert(xPos)
    let idx = bisector.left(data, xValue)
    if (idx < 0) return { id: chart.id, x: undefined, y: undefined, d: undefined }
    idx = Math.min(idx, data.length - 1)
    let yValue = data[idx][yDataKey]
    // look back
    if (yValue === null) {
      for (let i = idx; i >= 0; i--) {
        yValue = data[i][yDataKey]
        if (yValue !== null) {
          idx = i
          break
        }
      }
    }
    const x = xScale(data[idx][xDataKey])
    const y = yScale(yValue)
    // labels
    const yExtent = axis.chartsExtent('y', yIndex, {})
    const d = data[idx]
    if (yValue === null || yValue < yScale.domain()[0] || yValue > yScale.domain()[1]) {
      return { id: chart.id, x: undefined, y: undefined, d }
    }

    const yLabel = this.determineLabel(yExtent, yValue)
    return { id: chart.id, x, y, value: yLabel, d }
  }

  determineLabel(yExtent: any[], yValue: any) {
    const s = d3.formatSpecifier('f')
    s.precision = d3.precisionFixed((yExtent[1] - yExtent[0]) / 100)
    let yLabel
    if (Array.isArray(yValue)) {
      const labels: string[] = []
      for (let j = 0; j < yValue.length; j++) {
        labels[j] = d3.format(s.toString())(yValue[j])
      }
      yLabel = labels.join('–')
    } else {
      yLabel = d3.format(s.toString())(yValue)
    }
    return yLabel
  }
}
