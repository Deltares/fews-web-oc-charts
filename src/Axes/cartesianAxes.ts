import * as d3 from 'd3'
import { defaultsDeep, isEqual, merge } from 'lodash-es'

import { Axes, AxesOptions } from './axes.js'
import { AxisType } from '../Axis/axisType.js'
import { ResetZoom, ScaleOptions, ZoomOptions } from '../Scale/scaleOptions.js'
import { niceDomain } from './niceDomain.js'
import { Grid } from '../Grid/grid.js'
import { CartesianAxisOptions } from '../Axis/cartesianAxisOptions.js'
import { XAxis } from '../Axis/xAxis.js'
import { YAxis } from '../Axis/yAxis.js'
import { createLayers } from '../Layers/layers.js'
import { LabelOrientation } from '../Axis/labelOrientation.js'
import { AxisPosition } from '../Axis/axisPosition.js'
import { ceilByStep } from '../Utils/roundNumber.js'

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
    this.clipPathId = 'id-' + Math.random().toString(36).substring(2, 18)
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
    let scales: Array<any>
    let initialExtents: Array<any>
    if (axisKey === 'x') {
      scales = this.xScales
      initialExtents = this.xInitialExtent
    } else {
      scales = this.yScales
      initialExtents = this.yInitialExtent
    }
    for (const axisIndex of [0, 1] as (0 | 1)[]) {
      const scale = scales[axisIndex]
      if (!scale) continue

      const axisOptions = this.options[axisKey][axisIndex]
      const setCurrentDomain = (domain: [number, number] | [Date, Date]) =>
        this.setDomain(axisKey, axisIndex, domain)
      const makeDomainNice = () => {
        const updatedDomain = niceDomain(scale.domain(), 16, axisOptions.type)
        setCurrentDomain(updatedDomain)
      }

      const axisScaleOptions: ScaleOptions = {
        domain: axisOptions.domain,
        nice: axisOptions.nice,
        includeZero: axisOptions.includeZero,
        symmetric: axisOptions.symmetric,
      }
      const zoomOptions = { ...{ autoScale: false }, ...axisScaleOptions, ...options }
      if (zoomOptions?.domain) {
        setCurrentDomain(zoomOptions.domain)
        if (zoomOptions?.nice === true) makeDomainNice()
      } else if (axisOptions.type === AxisType.band) {
        const charts = this.charts.filter(
          (chart) => chart.axisIndex[axisKey]?.axisIndex === axisIndex,
        )
        const extent = charts.flatMap((chart) => chart.data.map((d) => d[chart.dataKeys[axisKey]]))
        setCurrentDomain(extent as [number, number] | [Date, Date])
      } else if (zoomOptions.autoScale === true || zoomOptions.fullExtent === true) {
        let defaultExtent
        let dataExtent = new Array(2)
        if (axisOptions?.defaultDomain !== undefined) {
          defaultExtent = axisOptions?.defaultDomain
        }
        dataExtent = this.chartsExtent(axisKey, axisIndex, zoomOptions)
        if (zoomOptions?.symmetric === true) {
          const max = Math.max(Math.abs(dataExtent[0]), Math.abs(dataExtent[1]))
          dataExtent[0] = -max
          dataExtent[1] = max
        }
        if (defaultExtent !== undefined) {
          if (defaultExtent[0] < dataExtent[0] || defaultExtent[1] > dataExtent[1]) {
            dataExtent = d3.extent([...defaultExtent, ...dataExtent])
          }
          if (zoomOptions?.includeZero === true) {
            dataExtent = d3.extent([...dataExtent, 0])
          }
        }
        setCurrentDomain(dataExtent as [number, number] | [Date, Date])
        if (zoomOptions?.nice === true) makeDomainNice()
      }
      const domain = scale.domain()
      if (initialExtents[axisIndex] === undefined && !isNaN(domain[0]) && !isNaN(domain[1]))
        initialExtents[axisIndex] = domain
    }
  }

  chartsExtent(
    axisKey: keyof CartesianAxesOptions,
    axisIndex: number,
    options: ZoomOptions,
  ): any[] {
    let extent = new Array(2)
    for (const chart of this.charts) {
      if (
        (options.fullExtent || chart.options[axisKey].includeInAutoScale) &&
        chart.axisIndex[axisKey]?.axisIndex === +axisIndex
      ) {
        const chartExtent = chart.extent[chart.dataKeys[axisKey]]
        extent = d3.extent(d3.merge([extent, [].concat(...chartExtent)]))
      }
    }
    return extent
  }

  redraw(options?): void {
    this.updateAxisScales(options?.x ?? {}, 'x')
    this.updateAxisScales(options?.y ?? {}, 'y')
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
    const g = this.canvas.select('g.labels')
    if (this.options.y) {
      if (this.options.y[0]?.label) {
        const label = g.select('.y0.label').text(this.options.y[0].label)

        if (this.options.y[0].labelOrientation === LabelOrientation.Vertical) {
          const offset = this.options.y[0].labelOffset ?? 0
          label.attr('x', -this.height / 2).attr('y', -30 - offset)
        }
      }
      if (this.options.y[0]?.unit) {
        g.select('.y0.unit').text(this.options.y[0].unit)
      }
      if (this.options.y[1]?.label) {
        const label = g.select('.y1.label').text(this.options.y[1].label)

        if (this.options.y[0].labelOrientation === LabelOrientation.Vertical) {
          const offset = this.options.y[1].labelOffset ?? 0
          label.attr('x', -this.height / 2).attr('y', this.width + 39 + offset)
        } else {
          label.attr('x', this.width)
        }
      }
      if (this.options.y[1]?.unit) {
        g.select('.y1.unit')
          .attr('x', this.width + 10)
          .text(this.options.y[1].unit)
      }
    }
    if (this.options.x[0]?.label) {
      const offset = this.options.x[0].labelOffset ?? 0
      g.select('.x0.label')
        .attr('x', this.width / 2)
        .attr('y', this.height + 30 + offset)
        .text(this.options.x[0].label)
    }
    if (this.options.x[0]?.unit) {
      g.select('.x0.unit')
        .attr('x', this.width + 10)
        .attr('y', this.height + 9)
        .text(this.options.x[0].unit)
    }

    if (this.options.x[1]?.unit) {
      g.select('.x1.unit')
        .attr('x', this.width + 10)
        .text(this.options.x[1].unit)
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

    if (this.options.y) {
      if (this.options.y[0]?.label) {
        const label = labelGroup
          .append('text')
          .attr('class', 'y0 label')
          .text(this.options.y[0].label)

        if (this.options.y[0].labelOrientation === LabelOrientation.Vertical) {
          const offset = this.options.y[0].labelOffset ?? 0
          label
            .attr('transform', 'rotate(-90)')
            .attr('x', -this.height / 2)
            .attr('y', -30 - offset)
            .attr('text-anchor', 'middle')
        } else {
          label.attr('x', 0).attr('y', -9).attr('text-anchor', 'start')
        }
      }
      if (this.options.y[0]?.unit) {
        labelGroup
          .append('text')
          .attr('class', 'y0 unit')
          .attr('x', -9)
          .attr('y', -9)
          .attr('text-anchor', 'end')
          .text(this.options.y[0].unit)
      }
      if (this.options.y[1]?.label) {
        const label = labelGroup
          .append('text')
          .attr('class', 'y1 label')
          .text(this.options.y[1].label)

        if (this.options.y[1].labelOrientation === LabelOrientation.Vertical) {
          const offset = this.options.y[1].labelOffset ?? 0
          label
            .attr('transform', 'rotate(-90)')
            .attr('x', -this.height / 2)
            .attr('y', this.width + 39 + offset)
            .attr('text-anchor', 'middle')
        } else {
          label.attr('x', this.width).attr('y', -9).attr('text-anchor', 'end')
        }
      }
      if (this.options.y[1]?.unit) {
        labelGroup
          .append('text')
          .attr('class', 'y1 unit')
          .attr('x', this.width + 10)
          .attr('y', -9)
          .attr('text-anchor', 'start')
          .text(this.options.y[1].unit)
      }
    }
    if (this.options.x[0]?.label) {
      const offset = this.options.x[0].labelOffset ?? 0
      labelGroup
        .append('text')
        .attr('class', 'x0 label')
        .attr('x', this.width / 2)
        .attr('y', this.height + 30 + offset)
        .attr('text-anchor', 'middle')
        .text(this.options.x[0].label)
    }
    if (this.options.x[0]?.unit) {
      labelGroup
        .append('text')
        .attr('class', 'x0 unit')
        .attr('x', this.width + 10)
        .attr('y', this.height + 9)
        .attr('dy', '0.71em')
        .attr('text-anchor', 'start')
        .text(this.options.x[0].unit)
    }

    if (this.options.x[1]?.unit) {
      labelGroup
        .append('text')
        .attr('class', 'x1 unit')
        .attr('x', this.width + 10)
        .attr('y', -9)
        .attr('text-anchor', 'start')
        .text(this.options.x[1].unit)
    }
  }
}
