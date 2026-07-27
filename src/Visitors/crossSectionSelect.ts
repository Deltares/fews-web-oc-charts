import * as d3 from 'd3'
import { Axes } from '../Axes/axes.js'
import { CartesianAxes, Chart } from '../index.js'
import { Visitor } from './visitor.js'
import { defaultsDeep } from 'lodash-es'
import {
  CrossSectionSelectRenderer,
  type CrossSectionPoint,
  type CrossSectionPointStyles,
} from './crossSectionSelectRenderer.js'
import { determineCrossSectionLabel, findCrossSectionPoint } from './crossSectionSelectSelection.js'

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
  private axis?: CartesianAxes
  private readonly renderer = new CrossSectionSelectRenderer()
  value: V
  currentData: any
  callback: (value: V) => void
  format: (n: number | { valueOf(): number } | Date) => string
  private readonly options: CrossSectionSelectOptions = {
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
    const traces = this.getTraces(axis)
    const { points, styles } = this.collectPoints(axis, traces, xPos)
    this.currentData = this.toCurrentData(points)
    this.updateLabels(points, styles)
    this.updateDataPoints(points, styles)
  }

  private getTraces(axis: CartesianAxes): string[] {
    return this.trace.length > 0 ? this.trace : axis.charts.map((chart) => chart.id)
  }

  private collectPoints(
    axis: CartesianAxes,
    traces: string[],
    xPos: number,
  ): { points: CrossSectionPoint[]; styles: CrossSectionPointStyles } {
    const points: CrossSectionPoint[] = []
    const styles: CrossSectionPointStyles = {}

    for (const chart of axis.charts) {
      if (!traces.includes(chart.id) || !chart.visible) continue
      points.push(findCrossSectionPoint({ axis, chart, xPos }))
      const chartStyle = this.styleForChart(chart.id)
      if (chartStyle) {
        styles[chart.id] = chartStyle
      }
    }

    return {
      points: points.filter((point) => point.y !== undefined),
      styles,
    }
  }

  private toCurrentData(
    points: CrossSectionPoint[],
  ): Array<{ id: string; data: any; value?: string }> {
    return points.map((point) => {
      return {
        id: point.id,
        data: point.d,
        value: point.value,
      }
    })
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
    this.renderer.updateLine({
      backGroup: this.backGroup,
      axisHeight: axis.height,
      xPos,
      visible: this.visible,
      value: this.value,
      format: this.format,
    })
  }

  updateDataPoints(points: any[], styles: Record<string, CSSStyleDeclaration>): void {
    this.renderer.updateDataPoints({
      frontGroup: this.frontGroup,
      points,
      styles,
      pointRadius: this.pointRadius,
      visible: this.visible,
    })
  }

  updateLabels(points: CrossSectionPoint[], styles: CrossSectionPointStyles): void {
    this.renderer.updateLabels({
      backGroup: this.backGroup,
      frontGroup: this.frontGroup,
      points,
      styles,
      pointRadius: this.pointRadius,
      visible: this.visible,
    })
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
    return findCrossSectionPoint({ axis: this.axis, chart, xPos })
  }

  determineLabel(yExtent: any[], yValue: any) {
    return determineCrossSectionLabel(yExtent, yValue)
  }
}
