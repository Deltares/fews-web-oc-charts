import * as d3 from 'd3'
import { defaultsDeep, merge } from 'lodash-es'

import { Axes, AxesOptions } from './axes.js'
import { AxisType } from '../Axis/axisType.js'
import { ResetZoom, ScaleOptions, ZoomOptions } from '../Scale/scaleOptions.js'
import { niceDomain } from './niceDomain.js'
import { Grid } from '../Grid/grid.js'
import { CartesianAxisOptions } from '../Axis/cartesianAxisOptions.js'
import { XAxis } from '../Axis/xAxis.js'
import { YAxis } from '../Axis/yAxis.js'
import { createLayers } from '../Layers/layers.js'


export interface CartesianAxesOptions extends AxesOptions {
  x: CartesianAxisOptions[];
  y: CartesianAxisOptions[];
}

const defaultAxesOptions = {
  x: [{ type: AxisType.value, labelAngle: 0 }],
  y: [{ type: AxisType.value, labelAngle: 0 }]
} as const

export class CartesianAxes extends Axes {
  gridHandles: Record<string, Grid> = {}
  axisHandles: Record<string, XAxis|YAxis> = {}
  layers: any
  xScales: Array<any> = []
  yScales: Array<any> = []
  xInitialExtent: Array<any> = []
  yInitialExtent: Array<any> = []
  clipPathId: string
  options: CartesianAxesOptions

  constructor(
    container: HTMLElement,
    width: number | null,
    height: number | null,
    options: CartesianAxesOptions
  ) {
    super(container, width, height, options, defaultAxesOptions)
    // Set defaults for each x- and y-axis.
    this.setDefaultAxisOptions(this.options.x, defaultAxesOptions.x[0])
    this.setDefaultAxisOptions(this.options.y, defaultAxesOptions.y[0])
    this.setDefaultTimeOptions(this.options.x)
    this.setDefaultTimeOptions(this.options.y)
    this.clipPathId ='id-' + Math.random().toString(36).substring(2, 18)
    this.setClipPath()

    this.layers = createLayers(this.canvas, this.width, this.height)

    this.chartGroup = this.layers.charts
      .attr('clip-path', `url(#${this.clipPathId})`)
      .append('g')
    this.createCanvas()
    this.createMouseLayer()

    this.initXScales(this.options.x)
    this.initYScales(this.options.y)
    this.initLabels()
    this.initAxisX(this.options.x)
    this.initAxisY(this.options.y)
    this.update()
  }

  setDefaultAxisOptions(axisOptions: CartesianAxisOptions[], defaultOptions: CartesianAxisOptions) {
    for (const options of axisOptions) {
      defaultsDeep(options, defaultOptions)
    }
  }

  setOptions(options: CartesianAxesOptions): void {
    merge(this.options,
      options
    )
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
}

  updateCanvas(): void {
    this.layers.canvas
      .select('rect')
      .attr('height', this.height)
      .attr('width', this.width)
  }

  updateMouseLayer(): void {
    this.layers.mouse
      .select('rect')
      .attr('height', this.height)
      .attr('width', this.width)
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
      clipPath
        .select('rect')
        .attr('height', this.height)
        .attr('width', this.width)
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
    for (const key in scales) {
      const scale = scales[key]
      const axisOptions = this.options[axisKey][key]
      const axisScaleOptions: ScaleOptions = {
        domain: axisOptions.domain,
        nice: axisOptions.nice,
        includeZero: axisOptions.includeZero,
        symmetric: axisOptions.symmetric,
      }
      const zoomOptions = { ... { autoScale: false }, ...axisScaleOptions, ...options }
      if (zoomOptions?.domain) {
        scale.domain(zoomOptions.domain)
        if (zoomOptions?.nice === true) scale.domain(niceDomain(scale.domain(), 16))
      } else if (zoomOptions.autoScale === true || zoomOptions.fullExtent === true) {
        let defaultExtent
        let dataExtent = new Array(2)
        if (axisOptions?.defaultDomain !== undefined) {
          defaultExtent = axisOptions?.defaultDomain
        }
        dataExtent = this.chartsExtent(axisKey, key, zoomOptions)
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
        scale.domain(dataExtent)
        if (zoomOptions?.nice === true) scale.domain(niceDomain(scale.domain(), 16))
      } else if (this.options[axisKey][key].type === AxisType.band) {
        let extent = new Array(0)
        for (const chart of this.charts) {
          if (chart.axisIndex[axisKey]?.axisIndex === +key) {
            extent = chart.data.map(d => d[chart.dataKeys[axisKey]])
            break
          }
        }
        scale.domain(extent)
      }
      const domain = scale.domain()
      if (initialExtents[key] === undefined && !isNaN(domain[0]) && !isNaN(domain[1])) initialExtents[key] = domain
    }
  }

  chartsExtent(axisKey: keyof CartesianAxesOptions, axisIndex: string, options: ZoomOptions): any[] {
    let extent = new Array(2)
    for (const chart of this.charts) {
      if ((options.fullExtent || chart.options[axisKey].includeInAutoScale) && chart.axisIndex[axisKey]?.axisIndex === +axisIndex) {
        const chartExtent = chart.extent[chart.dataKeys[axisKey]]
        extent = d3.extent(d3.merge([extent, [].concat(...chartExtent)]))
      }
    }
    return extent
  }

  redraw(options?): void {
    this.updateAxisScales(options.x ?? {}, 'x')
    this.updateAxisScales(options.y ?? {}, 'y')
    for (const chart of this.charts) {
      chart.plotter(this, chart.axisIndex)
    }
    this.update()
    for (const visitor of this.visitors) {
      visitor.redraw()
    }
  }

  removeInitialExtent(): void {
    this.xInitialExtent = []
    this.yInitialExtent = []
  }

  resetZoom(): void {
    const xOptions: ZoomOptions = { autoScale: true }
    if (this.options['x'][0].resetZoom === ResetZoom.full || (this.options['x'][0].resetZoom === ResetZoom.toggle && this.atInitialExtent(this.xScales[0].domain(), this.xInitialExtent[0]))) {
      xOptions.fullExtent = true
    }
    const yOptions: ZoomOptions = { autoScale: true }
    if (this.options['y'][0].resetZoom === ResetZoom.full || (this.options['y'][0].resetZoom === ResetZoom.toggle && this.atInitialExtent(this.yScales[0].domain(), this.yInitialExtent[0]))) {
      yOptions.fullExtent = true
    }
    this.redraw({ x: xOptions, y: yOptions })
  }

  atInitialExtent(domain: any, initialExtent: any): boolean {
    return initialExtent !== undefined && domain[0] === initialExtent[0] && domain[1] === initialExtent[1]
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
    Object.values(this.axisHandles).forEach(
      (axis) => axis.redraw()
    )
    this.setClipPath()
    this.updateCanvas()
    this.updateMouseLayer()
    this.updateLabels()
    Object.values(this.gridHandles).forEach(
      (grid) => grid.redraw()
    )
  }

  updateLabels(): void {
    const g = this.canvas.select('g.labels')
    if (this.options.y) {
      if (this.options.y[0]?.label) {
        g.select('.y0.label')
          .text(this.options.y[0].label)
      }
      if (this.options.y[0]?.unit) {
        g.select('.y0.unit')
          .text(this.options.y[0].unit)
      }
      if (this.options.y[1]?.label) {
        g.select('.y1.label')
          .attr('x', this.width)
          .text(this.options.y[1].label)
      }
      if (this.options.y[1]?.unit) {
        g.select('.y1.unit')
          .attr('x', this.width + 10)
          .text(this.options.y[1].unit)
      }
    }
    if (this.options.x[0]?.label) {
      g.select('.x0.label')
        .attr('x', this.width / 2)
        .attr('y', this.height + 30)
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

  protected initXScales(options: CartesianAxisOptions[]): void {
    for (const key in options) {
      let scale
      switch (options[key].type) {
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
    for (const key in options) {
      let scale
      switch (options[key].type) {
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
    for (const key in this.xScales) {
      const scale = this.xScales[key]
      if (options[key].reverse) {
        scale.range([this.width, 0])
      } else {
        scale.range([0, this.width])
      }
    }
  }

  protected setRangeY(options): void {
    for (const key in this.yScales) {
      const scale = this.yScales[key]
      if (options[key].reverse) {
        scale.range([0, this.height])
      } else {
        scale.range([this.height, 0])
      }
    }
  }

  protected initAxisX(options: CartesianAxisOptions[]): void {
    for (const index in options) {
      this.axisHandles[`x${index}`] = new XAxis(this.layers.axis, this.xScales[index], this.yScales[0], {
        axisKey: 'x',
        axisIndex: Number.parseInt(index),
        ...options[index]
      })
      if (options[index].showGrid) {
        this.gridHandles[`x${index}`] = new Grid(this.layers.grid, this.axisHandles[`x${index}`].axis, this.yScales[0], {axisKey: 'x', axisIndex: Number.parseInt(index)})
      }
    }
  }

  protected initAxisY(options: CartesianAxisOptions[]): void {
    for (const index in options) {
      this.axisHandles[`y${index}`] = new YAxis(this.layers.axis, this.yScales[index], this.xScales[0], {
        axisKey: 'y',
        axisIndex: Number.parseInt(index),
        ...options[index]
      })
      if (options[index].showGrid) {
        this.gridHandles[`y${index}`] = new Grid(this.layers.grid, this.axisHandles[`y${index}`].axis, this.xScales[0], {axisKey: 'y', axisIndex: Number.parseInt(index)})
      }
    }
  }

  protected initLabels(): void {
    const labelGroup = this.layers.labels
      .attr('font-family', 'sans-serif')

    if (this.options.y) {
      if (this.options.y[0]?.label) {
        labelGroup.append('text')
          .attr('class', 'y0 label')
          .attr('x', 0)
          .attr('y', -9)
          .attr('text-anchor', 'start')
          .attr('fill', 'currentColor')
          .text(this.options.y[0].label)
      }
      if (this.options.y[0]?.unit) {
        labelGroup.append('text')
          .attr('class', 'y0 unit')
          .attr('x', -9)
          .attr('y', -9)
          .attr('text-anchor', 'end')
          .attr('fill', 'currentColor')
          .text(this.options.y[0].unit)
      }
      if (this.options.y[1]?.label) {
        labelGroup.append('text')
          .attr('class', 'y1 label')
          .attr('x', this.width)
          .attr('y', -9)
          .attr('text-anchor', 'end')
          .attr('fill', 'currentColor')
          .text(this.options.y[1].label)
      }
      if (this.options.y[1]?.unit) {
        labelGroup.append('text')
          .attr('class', 'y1 unit')
          .attr('x', this.width + 10)
          .attr('y', -9)
          .attr('text-anchor', 'start')
          .attr('fill', 'currentColor')
          .text(this.options.y[1].unit)
      }
    }
    if (this.options.x[0]?.label) {
      labelGroup.append('text')
        .attr('class', 'x0 label')
        .attr('x', this.width / 2)
        .attr('y', this.height + 30)
        .attr('text-anchor', 'middle')
        .attr('fill', 'currentColor')
        .text(this.options.x[0].label)
    }
    if (this.options.x[0]?.unit) {
      labelGroup.append('text')
        .attr('class', 'x0 unit')
        .attr('x', this.width + 10)
        .attr('y', this.height + 9)
        .attr('dy', '0.71em')
        .attr('text-anchor', 'start')
        .attr('fill', 'currentColor')
        .text(this.options.x[0].unit)
    }

    if (this.options.x[1]?.unit) {
      labelGroup.append('text')
        .attr('class', 'x1 unit')
        .attr('x', this.width + 10)
        .attr('y', -9)
        .attr('text-anchor', 'start')
        .attr('fill', 'currentColor')
        .text(this.options.x[1].unit)
    }
  }
}
