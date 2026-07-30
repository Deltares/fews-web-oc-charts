import * as d3 from 'd3'
import { defaultsDeep, isEqual, merge } from 'lodash-es'

import { Axes, AxesOptions } from './axes.js'
import { AxisType } from '../Axis/axisType.js'
import { ResetZoom, ScaleOptions, ZoomOptions } from '../Scale/scaleOptions.js'
import { getNiceDomain } from './getNiceDomain.js'
import { Grid } from '../Grid/grid.js'
import { CartesianAxisOptions } from '../Axis/cartesianAxisOptions.js'
import { XAxis } from '../Axis/xAxis.js'
import { YAxis } from '../Axis/yAxis.js'
import { createLayers } from '../Layers/layers.js'
import { LabelOrientation } from '../Axis/labelOrientation.js'
import { AxisPosition } from '../Axis/axisPosition.js'
import { ceilByStep } from '../Utils/roundNumber.js'
import { niceDomain } from './niceDomain.js'

export type CartesianAxesIndex = { x: { axisIndex: number }; y: { axisIndex: number } }

export interface CartesianAxesOptions extends AxesOptions {
  x: CartesianAxisOptions[]
  y: CartesianAxisOptions[]
}

export interface DomainChangeEvent {
  axisIndex: 0 | 1
  old: [number, number] | [Date, Date]
  new: [number, number] | [Date, Date]
  fromZoomReset: boolean
}

export type CartesianAxesEventType = 'update:x-domain'
export type DomainChangeCallback = (event: DomainChangeEvent) => void

const defaultAxesOptions = {
  margin: { top: 20, right: 50, bottom: 20, left: 50 },
  automargin: false,
  x: [{ type: AxisType.value, labelAngle: 0 }],
  y: [{ type: AxisType.value, labelAngle: 0 }],
} as const

export class CartesianAxes extends Axes {
  gridHandles: Record<string, Grid> = {}
  axisHandles: Record<string, XAxis | YAxis> = {}
  layers: any
  xScales: Array<any> = []
  yScales: Array<any> = []
  xInitialExtent: Array<any> = []
  yInitialExtent: Array<any> = []
  clipPathId: string
  xDomainCallbacks: DomainChangeCallback[] = []
  declare options: CartesianAxesOptions

  private isDomainChangeFromZoomReset

  constructor(
    container: HTMLElement,
    width: number | null,
    height: number | null,
    options: CartesianAxesOptions,
  ) {
    super(container, width, height, options, defaultAxesOptions)
    this.isDomainChangeFromZoomReset = false

    // Set defaults for each x- and y-axis.
    this.setDefaultAxisOptions(this.options.x, defaultAxesOptions.x[0])
    this.setDefaultAxisOptions(this.options.y, defaultAxesOptions.y[0])
    this.setDefaultTimeOptions(this.options.x)
    this.setDefaultTimeOptions(this.options.y)
    this.clipPathId = 'clip-path-id-' + this.axesId
    this.setClipPath()

    this.layers = createLayers(this.canvas)

    this.chartGroup = this.layers.charts.attr('clip-path', `url(#${this.clipPathId})`).append('g')
    this.createCanvas()
    this.createMouseLayer()

    this.initXScales(this.options.x)
    this.initYScales(this.options.y)
    this.initLabels()
    this.initAxisX(this.options.x)
    this.initAxisY(this.options.y)
    this.update()
  }

  get xScalesDomains(): Array<Array<number>> {
    return this.xScales.map((scale) => scale.domain())
  }

  get yScalesDomains(): Array<Array<number>> {
    return this.yScales.map((scale) => scale.domain())
  }

  addEventListener(_event: CartesianAxesEventType, callback: DomainChangeCallback) {
    this.xDomainCallbacks.push(callback)
  }

  removeEventListener(_event: CartesianAxesEventType, callback: DomainChangeCallback) {
    // Remove only the specified callback from the list of callbacks; this is a no-op
    // if the specified callback does not exist.
    this.xDomainCallbacks = this.xDomainCallbacks.filter((entry) => entry !== callback)
  }

  setDefaultAxisOptions(axisOptions: CartesianAxisOptions[], defaultOptions: CartesianAxisOptions) {
    for (const options of axisOptions) {
      defaultsDeep(options, defaultOptions)
    }
  }

  setOptions(options: Partial<CartesianAxesOptions>): void {
    merge(this.options, options)
  }

  createCanvas(): void {
    this.layers.canvas
      .attr('clip-path', `url(#${this.clipPathId})`)
      .append('rect')
      .attr('width', this.width)
      .attr('height', this.height)
  }

  createMouseLayer(): void {
    this.layers.mouse
      .append('rect')
      .attr('width', this.width)
      .attr('height', this.height)
      .attr('fill', 'none')
      .attr('pointer-events', 'all')
  }

  updateCanvas(): void {
    this.layers.canvas.select('rect').attr('height', this.height).attr('width', this.width)
  }

  updateMouseLayer(): void {
    this.layers.mouse.select('rect').attr('height', this.height).attr('width', this.width)
  }

  setClipPath() {
    const clipPath = this.defs.select(`#${this.clipPathId}`)
    if (clipPath.size() === 0) {
      this.defs
        .append('clipPath')
        .attr('id', this.clipPathId)
        .append('rect')
        .attr('height', this.height)
        .attr('width', this.width)
    } else {
      clipPath.select('rect').attr('height', this.height).attr('width', this.width)
    }
  }

  updateAxisScales(options: ZoomOptions, axisKey: keyof CartesianAxesOptions): void {
    const scales = axisKey === 'x' ? this.xScales : this.yScales
    const initialExtents = axisKey === 'x' ? this.xInitialExtent : this.yInitialExtent
    for (const axisIndex of [0, 1] as (0 | 1)[]) {
      if (!scales[axisIndex]) continue
      this.updateSingleAxisScale(options, axisKey, axisIndex, initialExtents)
    }
  }

  private updateSingleAxisScale(
    options: ZoomOptions,
    axisKey: keyof CartesianAxesOptions,
    axisIndex: 0 | 1,
    initialExtents: Array<any>,
  ): void {
    const axisOptions = this.options[axisKey][axisIndex]
    const axisScaleOptions: ScaleOptions = {
      domain: axisOptions.domain,
      nice: axisOptions.nice,
      includeZero: axisOptions.includeZero,
      symmetric: axisOptions.symmetric,
    }
    const zoomOptions = { autoScale: false, ...axisScaleOptions, ...options }

    if (zoomOptions?.domain) {
      this.setDomain(axisKey, axisIndex, zoomOptions.domain)
    } else if (axisOptions.type === AxisType.band) {
      const charts = this.charts.filter(
        (chart) => chart.axisIndex[axisKey]?.axisIndex === axisIndex,
      )
      const extent = charts.flatMap((chart) => chart.data.map((d) => d[chart.dataKeys[axisKey]]))
      this.setDomain(axisKey, axisIndex, extent as [number, number] | [Date, Date])
    } else if (zoomOptions.autoScale === true || zoomOptions.fullExtent === true) {
      this.applyAutoScaleDomain(axisKey, axisIndex, axisOptions, zoomOptions)
    }

    const scale = (axisKey === 'x' ? this.xScales : this.yScales)[axisIndex]
    const domain = scale.domain()
    if (
      initialExtents[axisIndex] === undefined &&
      !Number.isNaN(domain[0]) &&
      !Number.isNaN(domain[1])
    ) {
      initialExtents[axisIndex] = domain
    }
  }

  private applyAutoScaleDomain(
    axisKey: keyof CartesianAxesOptions,
    axisIndex: 0 | 1,
    axisOptions: CartesianAxisOptions,
    zoomOptions: ZoomOptions,
  ): void {
    const defaultExtent = axisOptions?.defaultDomain
    let dataExtent = this.chartsExtent(axisKey, axisIndex, zoomOptions)

    if (zoomOptions?.symmetric === true) {
      const max = Math.max(Math.abs(dataExtent[0]), Math.abs(dataExtent[1]))
      dataExtent = [-max, max]
    }
    if (zoomOptions?.includeZero === true) {
      dataExtent = d3.extent([...dataExtent, 0])
    }

    if (zoomOptions?.nice === true) {
      this.applyNiceDomain(axisKey, axisIndex, axisOptions, zoomOptions, dataExtent, defaultExtent)
    } else {
      if (
        defaultExtent !== undefined &&
        (defaultExtent[0] < dataExtent[0] || defaultExtent[1] > dataExtent[1])
      ) {
        dataExtent = d3.extent([...defaultExtent, ...dataExtent])
      }
      this.setDomain(axisKey, axisIndex, dataExtent as [number, number] | [Date, Date])
    }
  }

  private applyNiceDomain(
    axisKey: keyof CartesianAxesOptions,
    axisIndex: 0 | 1,
    axisOptions: CartesianAxisOptions,
    zoomOptions: ZoomOptions,
    dataExtent: any[],
    defaultDomain: any,
  ): void {
    let updatedDomain =
      axisOptions.type === AxisType.degrees
        ? niceDomain(dataExtent, 16, AxisType.degrees)
        : getNiceDomain({ defaultDomain, dataExtent, bufferRatio: 0.05 })
    if (zoomOptions?.includeZero === true) {
      updatedDomain = d3.extent([...updatedDomain, 0])
    }
    if (defaultDomain !== undefined) {
      updatedDomain[0] = Math.min(defaultDomain[0], updatedDomain[0])
      updatedDomain[1] = Math.max(defaultDomain[1], updatedDomain[1])
    }
    this.setDomain(axisKey, axisIndex, updatedDomain)
  }

  chartsExtent(
    axisKey: keyof CartesianAxesOptions,
    axisIndex: number,
    options: ZoomOptions,
  ): any[] {
    let extent = new Array(2)
    const visibleCharts = this.charts.filter((chart) => chart.visible)
    for (const chart of visibleCharts) {
      if (
        (options.fullExtent || chart.options[axisKey].includeInAutoScale) &&
        chart.axisIndex[axisKey]?.axisIndex === +axisIndex
      ) {
        const chartExtent = chart.extent[chart.dataKeys[axisKey]]
        extent = d3.extent(d3.merge([extent, chartExtent.flat()]))
      }
    }
    return extent
  }

  redraw(options?: { x?: ZoomOptions; y?: ZoomOptions }): void {
    if (options?.x) {
      this.updateAxisScales(options?.x ?? {}, 'x')
    }
    if (options?.y) {
      this.updateAxisScales(options?.y ?? {}, 'y')
    }
    this.update()
    for (const chart of this.charts) {
      chart.plotter(this, chart.axisIndex)
    }
    for (const visitor of this.visitors) {
      visitor.redraw()
    }
    // Reset keeping track of zoom resets after the first redraw call after a
    // zoom reset.
    this.isDomainChangeFromZoomReset = false
  }

  removeInitialExtent(): void {
    this.xInitialExtent = []
    this.yInitialExtent = []
  }

  resetZoom(): void {
    const xOptions: ZoomOptions = { autoScale: true }
    if (
      this.options['x'][0].resetZoom === ResetZoom.full ||
      (this.options['x'][0].resetZoom === ResetZoom.toggle &&
        this.atInitialExtent(this.xScales[0].domain(), this.xInitialExtent[0]))
    ) {
      xOptions.fullExtent = true
    }
    const yOptions: ZoomOptions = { autoScale: true }
    if (
      this.options['y'][0].resetZoom === ResetZoom.full ||
      (this.options['y'][0].resetZoom === ResetZoom.toggle &&
        this.atInitialExtent(this.yScales[0].domain(), this.yInitialExtent[0]))
    ) {
      yOptions.fullExtent = true
    }
    this.isDomainChangeFromZoomReset = true
    this.redraw({ x: xOptions, y: yOptions })
  }

  atInitialExtent(domain: any, initialExtent: any): boolean {
    return (
      initialExtent !== undefined &&
      domain[0] === initialExtent[0] &&
      domain[1] === initialExtent[1]
    )
  }

  resize(): void {
    this.setSize()
    this.setRange()
    this.zoom()
  }

  zoom(): void {
    for (const chart of this.charts) {
      chart.plotter(this, chart.axisIndex)
    }
    this.update()
    for (const visitor of this.visitors) {
      visitor.redraw()
    }
  }

  update(): void {
    const marginRequiresUpdate = this.redrawAxes()
    if (marginRequiresUpdate) {
      this.setSize()
      this.setRange()
      Object.values(this.axisHandles).forEach((axis) => {
        axis.redraw()
      })
    }

    this.setClipPath()
    this.updateCanvas()
    this.updateMouseLayer()
    this.updateLabels()
    Object.values(this.gridHandles).forEach((grid) => grid.redraw())
  }

  redrawAxes(): boolean {
    let requiresRedraw = false
    Object.values(this.axisHandles).forEach((axis) => {
      axis.redraw()
      if (this.options.automargin && axis.clientRect) {
        if (axis.position === AxisPosition.Left && axis.clientRect.width > this.margin.left) {
          this.margin.left = ceilByStep(axis.clientRect.width, 10)
          requiresRedraw = true
        }
        if (axis.position === AxisPosition.Right && axis.clientRect.width > this.margin.right) {
          this.margin.right = ceilByStep(axis.clientRect.width, 10)
          requiresRedraw = true
        }
        if (axis.position === AxisPosition.Bottom && axis.clientRect.height > this.margin.bottom) {
          this.margin.bottom = ceilByStep(axis.clientRect.height, 10)
          requiresRedraw = true
        }
        if (axis.position === AxisPosition.Top && axis.clientRect.height > this.margin.top) {
          this.margin.top = ceilByStep(axis.clientRect.height, 10)
          requiresRedraw = true
        }
      }
    })
    return requiresRedraw
  }

  updateLabels(): void {
    const labelGroup = this.canvas.select('g.labels')
    this.updateYLabels(labelGroup)
    this.updateXLabels(labelGroup)
  }

  private updateYLabels(labelGroup: any): void {
    if (!this.options.y) return

    const y0 = this.options.y[0]
    const y1 = this.options.y[1]

    if (y0?.label) {
      const label = labelGroup.select('.y0.label').text(y0.label)
      if (y0.labelOrientation === LabelOrientation.Vertical) {
        const offset = y0.labelOffset ?? 0
        label.attr('x', -this.height / 2).attr('y', -30 - offset)
      }
    }

    if (y0?.unit) {
      labelGroup.select('.y0.unit').text(y0.unit)
    }

    if (y1?.label) {
      const label = labelGroup.select('.y1.label').text(y1.label)
      if (y0?.labelOrientation === LabelOrientation.Vertical) {
        const offset = y1.labelOffset ?? 0
        label.attr('x', -this.height / 2).attr('y', this.width + 39 + offset)
      } else {
        label.attr('x', this.width)
      }
    }

    if (y1?.unit) {
      labelGroup
        .select('.y1.unit')
        .attr('x', this.width + 10)
        .text(y1.unit)
    }
  }

  private updateXLabels(labelGroup: any): void {
    const x0 = this.options.x[0]
    const x1 = this.options.x[1]

    if (x0?.label) {
      const offset = x0.labelOffset ?? 0
      labelGroup
        .select('.x0.label')
        .attr('x', this.width / 2)
        .attr('y', this.height + 30 + offset)
        .text(x0.label)
    }

    if (x0?.unit) {
      labelGroup
        .select('.x0.unit')
        .attr('x', this.width + 10)
        .attr('y', this.height + 9)
        .text(x0.unit)
    }

    if (x1?.unit) {
      labelGroup
        .select('.x1.unit')
        .attr('x', this.width + 10)
        .text(x1.unit)
    }
  }

  getScale(axisKey: keyof CartesianAxesOptions, axisIndex: 0 | 1): any {
    const scales = axisKey === 'x' ? this.xScales : this.yScales
    const scale = scales[axisIndex]
    return scale
  }

  setDomain(
    axisKey: keyof CartesianAxesOptions,
    axisIndex: 0 | 1,
    newDomain: [number, number] | [Date, Date],
  ): void {
    const scale = this.getScale(axisKey, axisIndex)
    if (!scale) {
      throw new Error(
        `Cannot set domain of ${axisKey}-axis ${axisIndex} because the axis does not exist.`,
      )
    }
    const oldDomain = scale.domain()
    scale.domain(newDomain)

    // Call all domain change callbacks when the x-axis is changed.
    if (axisKey === 'x' && this.xDomainCallbacks.length > 0 && !isEqual(oldDomain, newDomain)) {
      const event: DomainChangeEvent = {
        axisIndex,
        old: oldDomain,
        new: newDomain,
        fromZoomReset: this.isDomainChangeFromZoomReset,
      }
      this.xDomainCallbacks.forEach((callback) => callback(event))
    }
  }

  protected initXScales(options: CartesianAxisOptions[]): void {
    for (const axisOptions of options) {
      let scale
      switch (axisOptions.type) {
        case AxisType.time:
          scale = d3.scaleUtc()
          break
        case AxisType.band:
          scale = d3.scaleBand()
          break
        default:
          scale = d3.scaleLinear()
      }
      this.setRangeX(options)
      this.xScales.push(scale)
    }
  }

  protected initYScales(options: CartesianAxisOptions[]): void {
    for (const axisOptions of options) {
      let scale
      switch (axisOptions.type) {
        case AxisType.time:
          scale = d3.scaleUtc()
          break
        case AxisType.band:
          scale = d3.scaleBand()
          break
        default:
          scale = d3.scaleLinear()
      }
      this.setRangeY(options)
      this.yScales.push(scale)
    }
  }

  protected setRange(): void {
    this.setRangeX(this.options.x)
    this.setRangeY(this.options.y)
  }

  protected setRangeX(options): void {
    for (const [key, scale] of this.xScales.entries()) {
      if (options[key].reverse) {
        scale.range([this.width, 0])
      } else {
        scale.range([0, this.width])
      }
    }
  }

  protected setRangeY(options): void {
    for (const [key, scale] of this.yScales.entries()) {
      if (options[key].reverse) {
        scale.range([0, this.height])
      } else {
        scale.range([this.height, 0])
      }
    }
  }

  protected initAxisX(options: CartesianAxisOptions[]): void {
    for (const [axisIndex, axisOptions] of options.entries()) {
      if (axisOptions.showAxis ?? true) {
        this.axisHandles[`x${axisIndex}`] = new XAxis(
          this.layers.axis,
          this.xScales[axisIndex],
          this.yScales[0],
          {
            axisKey: 'x',
            axisIndex,
            ...axisOptions,
          },
        )
      }
      if (axisOptions.showGrid) {
        this.gridHandles[`x${axisIndex}`] = new Grid(
          this.layers.grid,
          this.axisHandles[`x${axisIndex}`].axis,
          this.yScales[0],
          { axisKey: 'x', axisIndex },
        )
      }
    }
  }

  protected initAxisY(options: CartesianAxisOptions[]): void {
    for (const [axisIndex, axisOptions] of options.entries()) {
      if (axisOptions.showAxis ?? true) {
        this.axisHandles[`y${axisIndex}`] = new YAxis(
          this.layers.axis,
          this.yScales[axisIndex],
          this.xScales[0],
          {
            axisKey: 'y',
            axisIndex,
            ...axisOptions,
          },
        )
      }
      if (axisOptions.showGrid) {
        this.gridHandles[`y${axisIndex}`] = new Grid(
          this.layers.grid,
          this.axisHandles[`y${axisIndex}`].axis,
          this.xScales[0],
          { axisKey: 'y', axisIndex },
        )
      }
    }
  }

  protected initLabels(): void {
    const labelGroup = this.layers.labels.attr('font-family', 'sans-serif')
    this.initYLabels(labelGroup)
    this.initXLabels(labelGroup)
  }

  private initYLabels(labelGroup: any): void {
    if (!this.options.y) return

    const y0 = this.options.y[0]
    const y1 = this.options.y[1]

    if (y0?.label) {
      const label = labelGroup.append('text').attr('class', 'y0 label').text(y0.label)

      if (y0.labelOrientation === LabelOrientation.Vertical) {
        const offset = y0.labelOffset ?? 0
        label
          .attr('transform', 'rotate(-90)')
          .attr('x', -this.height / 2)
          .attr('y', -30 - offset)
          .attr('text-anchor', 'middle')
      } else {
        label.attr('x', 0).attr('y', -9).attr('text-anchor', 'start')
      }
    }

    if (y0?.unit) {
      labelGroup
        .append('text')
        .attr('class', 'y0 unit')
        .attr('x', -9)
        .attr('y', -9)
        .attr('text-anchor', 'end')
        .text(y0.unit)
    }

    if (y1?.label) {
      const label = labelGroup.append('text').attr('class', 'y1 label').text(y1.label)

      if (y1.labelOrientation === LabelOrientation.Vertical) {
        const offset = y1.labelOffset ?? 0
        label
          .attr('transform', 'rotate(-90)')
          .attr('x', -this.height / 2)
          .attr('y', this.width + 39 + offset)
          .attr('text-anchor', 'middle')
      } else {
        label.attr('x', this.width).attr('y', -9).attr('text-anchor', 'end')
      }
    }

    if (y1?.unit) {
      labelGroup
        .append('text')
        .attr('class', 'y1 unit')
        .attr('x', this.width + 10)
        .attr('y', -9)
        .attr('text-anchor', 'start')
        .text(y1.unit)
    }
  }

  private initXLabels(labelGroup: any): void {
    const x0 = this.options.x[0]
    const x1 = this.options.x[1]

    if (x0?.label) {
      const offset = x0.labelOffset ?? 0
      labelGroup
        .append('text')
        .attr('class', 'x0 label')
        .attr('x', this.width / 2)
        .attr('y', this.height + 30 + offset)
        .attr('text-anchor', 'middle')
        .text(x0.label)
    }

    if (x0?.unit) {
      labelGroup
        .append('text')
        .attr('class', 'x0 unit')
        .attr('x', this.width + 10)
        .attr('y', this.height + 9)
        .attr('dy', '0.71em')
        .attr('text-anchor', 'start')
        .text(x0.unit)
    }

    if (x1?.unit) {
      labelGroup
        .append('text')
        .attr('class', 'x1 unit')
        .attr('x', this.width + 10)
        .attr('y', -9)
        .attr('text-anchor', 'start')
        .text(x1.unit)
    }
  }
}
