import * as d3 from 'd3'
// import { scaleLinear } from 'd3-scale'

export const CLOCKWISE = -1
export const ANTICLOCKWISE = 1
export const AUTO_SCALE = 1

export interface Data {
  x: number[]
  y: number[]
}

function mean(x: number[] | number) {
  if (x instanceof Array) {
    return d3.mean(x)
  }
  return x
}

export interface AxisOptions {}

export interface PolarAxisOptions extends AxisOptions {
  direction?: number
  angularRange?: number[]
  radialScale?: number | number[]
  targetMax?: number
  innerRadius?: number
  intercept?: number
  yLabel?: string
  xLabel?: string
}

export interface CartesianAxisOptions extends AxisOptions {
  yScale?: number | number[]
  yLabel?: string
  xLabel?: string
}

export abstract class Axis {
  tooltip: any = null
  type: string
  canvas: any
  container: HTMLElement
  width: number
  height: number
  margin: any
  options: any
  charts: Chart[]
  initialDraw: boolean = true

  constructor(container: HTMLElement, width: number, height: number, options: AxisOptions) {
    this.container = container
    this.options = options
    let margin = (this.margin = {
      top: 40,
      right: 40,
      bottom: 40,
      left: 40
    })
    this.height = height - margin.top - margin.bottom
    this.width = width - margin.left - margin.right
    this.canvas = d3
      .select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')
    this.createTooltip()
    this.charts = []
  }

  abstract redraw()

  abstract updateGrid()

  createTooltip() {
    this.tooltip = d3
      .select('body')
      .append('div')
      .attr('class', 'tooltip')
      .style('opacity', 0)
  }

  abstract showTooltip(d: any)

  hideTooltip(d: any) {
    this.tooltip
      .transition()
      .duration(50)
      .style('opacity', 0)
  }

  protected abstract setRange()
  protected abstract initGrid()
}

export class CartesianAxis extends Axis {
  canvas: any
  container: HTMLElement
  xScale: any
  yScale: any

  constructor(
    container: HTMLElement,
    width: number,
    height: number,
    options?: CartesianAxisOptions
  ) {
    super(container, width, height, options)
    this.canvas
      .append('g')
      .attr('class', 'axis-canvas')
      .append('rect')
      .attr('width', this.width)
      .attr('height', this.height)

    this.setRange()
    this.initGrid()
  }

  redraw() {
    let xExtent = new Array(2)
    let yExtent = new Array(2)
    for (let chart of this.charts) {
      let chartXExtent = d3.extent(chart.data, function(d: any) {
        return d[chart.dataKeys.xkey]
      })
      let chartYExtent = d3.extent(chart.data, function(d: any) {
        return d[chart.dataKeys.ykey]
      })
      xExtent = d3.extent(d3.merge([xExtent, [].concat(...chartXExtent)]))
      yExtent = d3.extent(d3.merge([yExtent, [].concat(...chartYExtent)]))
    }
    this.xScale.domain(xExtent).nice()
    this.yScale.domain(yExtent).nice()

    for (let chart of this.charts) {
      chart.plotterCartesian(this, chart.dataKeys)
    }
    this.updateGrid()
  }

  updateGrid() {
    let xAxis = d3.axisBottom(this.xScale).ticks(5)
    let xGrid = d3
      .axisBottom(this.xScale)
      .ticks(5)
      .tickSize(this.height)
    let yAxis = d3.axisLeft(this.yScale).ticks(5)
    let yGrid = d3
      .axisRight(this.yScale)
      .ticks(5)
      .tickSize(this.width)
    if (this.options.transitionTime > 0 && !this.initialDraw) {
      let t = d3
        .transition()
        .duration(this.options.transitionTime)
        .ease(d3.easeLinear)
      this.canvas
        .select('.x-axis')
        .transition(t)
        .call(xAxis)
      this.canvas
        .select('.x-grid')
        .transition(t)
        .call(xGrid)
      this.canvas
        .select('.y-axis')
        .transition(t)
        .call(yAxis)
      this.canvas
        .select('.y-grid')
        .transition(t)
        .call(yGrid)
    } else {
      this.canvas.select('.x-axis').call(xAxis)
      this.canvas.select('.x-grid').call(xGrid)
      this.canvas.select('.y-axis').call(yAxis)
      this.canvas.select('.y-grid').call(yGrid)
    }
    this.initialDraw = false
  }

  showTooltip(d: any) {
    this.tooltip
      .transition()
      .duration(50)
      .style('opacity', 0.9)
    this.tooltip
      .html('x: ' + d.x + '<br/>' + 'y: ' + d.y.toFixed(2))
      .style('left', d3.event.pageX + 'px')
      .style('top', d3.event.pageY + 'px')
  }

  protected setRange() {
    this.xScale = d3.scaleLinear().range([0, this.width])
    this.yScale = d3.scaleLinear().range([this.height, 0])
    this.canvas
      .append('text')
      .attr('x', -40)
      .attr('y', -10)
      .style('fill', 'white')
      .style('text-anchor', 'start')
      .style('font-size', '11px')
      .text(this.options.yLabel)
    this.canvas
      .append('text')
      .attr('x', this.width / 2)
      .attr('y', this.height + 30)
      .style('fill', 'white')
      .style('text-anchor', 'middle')
      .style('font-size', '11px')
      .text(this.options.xLabel)
  }

  protected initGrid() {
    let g = this.canvas
    let yGrid = g.append('g').attr('class', 'y-grid')
    let xGrid = g.append('g').attr('class', 'x-grid')
    let horizontalAxis = g
      .append('g')
      .attr('class', 'x-axis')
      .attr('transform', 'translate(' + 0 + ',' + this.height + ')')
    let yAxis = g.append('g').attr('class', 'y-axis')
  }
}

export class PolarAxis extends Axis {
  radialScale: any
  angularScale: any
  outerRadius: number
  innerRadius: number
  intercept: number
  direction: number
  private angularRange: number[]

  constructor(container: HTMLElement, width: number, height: number, options?: PolarAxisOptions) {
    super(container, width, height, options)
    this.canvas = this.canvas
      .append('g')
      .attr('transform', 'translate(' + this.width / 2 + ',' + this.height / 2 + ' )')

    this.direction = options.direction ? options.direction : ANTICLOCKWISE
    this.intercept = options.intercept ? options.intercept : 0
    this.innerRadius = options.innerRadius ? options.innerRadius : 0
    this.outerRadius = Math.min(this.width, this.height) / 2
    if (options.angularRange) {
      this.angularRange = [options.angularRange[0], options.angularRange[1]]
    } else {
      this.angularRange = [0, 2 * Math.PI]
    }

    this.canvas
      .append('g')
      .attr('class', 'axis-canvas')
      .append('path')
      .attr(
        'd',
        d3
          .arc()
          .innerRadius(this.innerRadius)
          .outerRadius(this.outerRadius)
          .startAngle(this.angularRange[0])
          .endAngle(this.angularRange[1])
      )

    this.setRange()
    this.initGrid()
  }

  redraw() {
    let radialExtent = new Array(2)
    for (let chart of this.charts) {
      let chartRadialExtent = d3.extent(chart.data, function(d: any) {
        return d[chart.dataKeys.rkey]
      })
      radialExtent = d3.extent(d3.merge([radialExtent, [].concat(...chartRadialExtent)]))
    }
    this.radialScale.domain(radialExtent).nice()
    for (let chart of this.charts) {
      chart.plotterPolar(this, chart.dataKeys)
    }
    this.updateGrid()
  }

  radToDegrees(value: number): number {
    return (value * 180) / Math.PI
  }

  updateGrid() {
    // draw the circular grid lines
    let g = this.canvas
    // draw the radial axis
    let rAxis = d3.axisBottom(this.radialScale).ticks(5)

    let radialAxis = this.canvas.select('.r-axis').call(rAxis)

    let radialTicks = this.radialScale.ticks(5).map(this.radialScale)
    let drawRadial = this.canvas
      .select('.r-grid')
      .selectAll('circle')
      .data(radialTicks)
    drawRadial.exit().remove()
    drawRadial
      .enter()
      .append('circle')
      .merge(drawRadial)
      .attr('cx', 0)
      .attr('cy', 0)
      .attr('r', function(d: number) {
        return d
      })

    let angularTicks = d3.range(
      this.angularRange[0],
      this.angularRange[1],
      this.angularRange[1] / 8
    )
    let suffix: string = ''
    let offset = 10

    angularTicks = angularTicks.map(this.radToDegrees)

    let drawAngular = this.canvas
      .select('.t-grid')
      .selectAll('line')
      .data(angularTicks)
      .enter()
      .append('line')
      .attr('x1', radialTicks[0])
      .attr('y1', 0)
      .attr('x2', this.outerRadius)
      .attr('y2', 0)
      .attr('transform', function(d: number) {
        return 'rotate(' + d + ')'
      })

    let groupRotate = function(d: number) {
      return 'rotate(' + -this.direction * d + ')'
    }.bind(this)
    let drawTicks = this.canvas
      .select('.t-axis')
      .selectAll('g')
      .data(angularTicks)
      .enter()
      .append('g')
      .attr('class', 'tick')
      .attr('transform', groupRotate)
    //   .attr('opacity',1)

    drawTicks
      .append('line')
      .attr('x1', this.outerRadius)
      .attr('y1', 0)
      .attr('x2', this.outerRadius + 6)
      .attr('y2', 0)

    let textRotate = function(d: number) {
      return (
        'rotate(' +
        (this.direction * d + this.intercept) +
        ',' +
        (this.outerRadius + 15) +
        ',0' +
        ')'
      )
    }.bind(this)
    let anchor = function(d: number) {
      let dNorthCW = (((90 - this.intercept - this.direction * d) % 360) + 360) % 360
      if (dNorthCW > 0 && dNorthCW < 180) {
        return 'start'
      } else if (dNorthCW > 180 && dNorthCW < 360) {
        return 'end'
      } else {
        return 'middle'
      }
    }.bind(this)

    drawTicks
      .append('text')
      .attr('text-anchor', anchor)
      .attr('alignment-baseline', 'middle')
      .attr('x', this.outerRadius + 15)
      .attr('y', 0)
      .text(function(d: number) {
        return d
      })
      .attr('transform', textRotate)
  }

  showTooltip(d: any) {
    this.tooltip
      .transition()
      .duration(50)
      .style('opacity', 0.9)
    this.tooltip
      .html('t: ' + mean(d.t).toFixed(2) + '<br/>' + 'r: ' + mean(d.r).toFixed(2))
      .style('left', d3.event.pageX + 'px')
      .style('top', d3.event.pageY + 'px')
  }

  protected setRange() {
    this.radialScale = d3.scaleLinear().range([this.innerRadius, this.outerRadius])
    this.angularScale = d3
      .scaleLinear()
      .domain([0, 360])
      .range(this.angularRange)
  }

  protected initGrid() {
    let radialGrid = this.canvas.append('g').attr('class', 'r-grid')
    let angularGrid = this.canvas.append('g').attr('class', 't-grid')
    let radialAxis = this.canvas.append('g').attr('class', 'r-axis')
    let angularAxis = this.canvas
      .append('g')
      .attr('class', 't-axis')
      .attr('font-size', '10')
      .attr('font-family', 'sans-serif')
      .attr('transform', 'rotate(' + -this.intercept + ')')
    this.updateGrid()
  }
}

export const RANGE = 13

export abstract class Chart {
  data: any
  style: any
  group: any
  colorMap: any
  id: string
  options: any
  dataKeys: any

  constructor(data: any, options: any) {
    this.data = data
    this.options = options
    if (!('transitionTime' in this.options)) {
      this.options.transitionTime = 100
    }
    // https://github.com/d3/d3-scale-chromatic
    this.colorMap = d3.scaleSequential(d3.interpolateWarm)
  }

  addTo(axis: Axis, dataKeys: any, id?: string) {
    this.id = id ? id : ''
    this.dataKeys = dataKeys
    axis.charts.push(this)
    return this
  }

  abstract plotterCartesian(axis: CartesianAxis, dataKeys: any)
  abstract plotterPolar(axis: PolarAxis, dataKeys: any)

  protected selectGroup(axis: Axis, cssClass: string) {
    let direction = 1
    let intercept = 0
    if (axis instanceof PolarAxis) {
      direction = -axis.direction
      intercept = 90 - axis.intercept
    }
    this.group =
      this.group != null
        ? this.group
        : axis.canvas
            .append('g')
            .attr('class', cssClass)
            .attr('id', this.id)
            .attr('transform', 'rotate(' + intercept + ')scale(' + direction + ' ,1)')
    return this.group
  }

  protected mapDataCartesian(axis: CartesianAxis, dataKeys: any) {
    let xkey = dataKeys.xkey ? dataKeys.xkey : 'x'
    let ykey = dataKeys.ykey ? dataKeys.ykey : 'y'
    let mappedData: any = this.data.map(function(d: any) {
      return {
        x: axis.xScale(d[xkey]),
        y: axis.yScale(d[ykey])
      }
    })
    return mappedData
  }

  protected mapDataPolar(axis: PolarAxis, dataKeys: any) {
    let tkey = dataKeys.tkey ? dataKeys.tkey : 't'
    let rkey = dataKeys.rkey ? dataKeys.rkey : 'r'

    let mappedData: any = this.data.map(function(d: any) {
      return {
        r: axis.radialScale(d[rkey]),
        t: axis.angularScale(d[tkey])
      }
    })
    return mappedData
  }
}

export class ChartMarker extends Chart {
  private previousData: any[] = []

  plotterCartesian(axis: CartesianAxis, dataKeys: any) {
    let mappedData = this.mapDataCartesian(axis, dataKeys)
    this.group = this.selectGroup(axis, 'chart-marker')
    let elements = this.group.selectAll('.symbol').data(mappedData)
    let symbolId = this.options.symbolId ? this.options.symbolId : 0

    // exit selection
    elements.exit().remove()

    // enter + update selection
    elements
      .enter()
      .append('path')
      .merge(elements)
      .attr('transform', function(d: any, i: number) {
        return 'translate(' + d.x + ',' + d.y + ')'
      })
      .attr('d', d3.symbol().type(d3.symbols[symbolId]))
  }

  plotterPolar(axis: PolarAxis, dataKeys: any) {
    this.group = this.selectGroup(axis, 'chart-marker')
    let symbolId = this.options.symbolId ? this.options.symbolId : 0
    const tkey = dataKeys.tkey ? dataKeys.tkey : 't'
    const rkey = dataKeys.rkey ? dataKeys.rkey : 'r'

    let elements = this.group.selectAll('path').data(this.data)

    function arcTranslation(p) {
      // We only use 'd', but list d,i,a as params just to show can have them as params.
      // Code only really uses d and t.
      return function(d, i, a) {
        let old = p[i]
        if (mean(old[tkey]) - mean(d[tkey]) > 180) {
          old[tkey] = old[tkey] - 360
        } else if (mean(old[tkey]) - mean(d[tkey]) < -180) {
          old[tkey] = old[tkey] + 360
        }
        let tInterpolate = d3.interpolate(old[tkey], d[tkey])
        let rInterpolate = d3.interpolate(old[rkey], d[rkey])
        return function(t) {
          const theta = axis.angularScale(tInterpolate(t))
          const radius = axis.radialScale(rInterpolate(t))
          return 'translate(' + -radius * Math.sin(-theta) + ',' + -radius * Math.cos(-theta) + ')'
        }
      }
    }

    // exit selection
    elements.exit().remove()

    // enter + update selection
    elements
      .enter()
      .append('path')
      .attr('transform', function(d: any, i: number) {
        const r: number = axis.radialScale(d[rkey])
        const t: number = axis.angularScale(d[tkey])
        return 'translate(' + -r * Math.sin(-t) + ',' + -r * Math.cos(-t) + ')'
      })
      .attr('d', d3.symbol().type(d3.symbols[symbolId]))
      .on('mouseover', function(d: any) {
        const v = { r: d[rkey], t: d[tkey] }
        axis.showTooltip(v)
      })
      .on('mouseout', function(d: any) {
        axis.hideTooltip(d)
      })
      .merge(elements)

    let t = d3
      .transition()
      .duration(this.options.transitionTime)
      .ease(d3.easeLinear)

    elements.transition(t).attrTween('transform', arcTranslation(this.previousData))

    this.previousData = this.data
  }
}

export class ChartLine extends Chart {
  plotterCartesian(axis: CartesianAxis, dataKeys: any) {
    let mappedData = this.mapDataCartesian(axis, dataKeys)
    let line = d3
      .line()
      .x(function(d: any) {
        return d.x
      })
      .y(function(d: any) {
        return d.y
      })
      .defined(function(d: any) {
        return d.y != null
      })

    this.group = this.selectGroup(axis, 'chart-line')
    let elements = this.group.selectAll('path').data(mappedData)

    // exit selection
    elements.exit().remove()

    // enter + update selection
    elements
      .enter()
      .append('path')
      .merge(elements)
      .attr('d', line(mappedData))
  }

  plotterPolar(axis: PolarAxis, dataKeys: any) {
    let mappedData = this.mapDataPolar(axis, dataKeys)
    const tkey = dataKeys.tkey ? dataKeys.tkey : 't'
    const rkey = dataKeys.rkey ? dataKeys.rkey : 'r'
    let line = d3
      .lineRadial()
      .angle(function(d: any) {
        return d.t
      })
      .radius(function(d: any) {
        return d.r
      })
    this.group = this.selectGroup(axis, 'chart-line')
    let elements = this.group.selectAll('path').data(this.data)

    // exit selection
    elements.exit().remove()

    // enter + update selection
    elements
      .enter()
      .append('path')
      .attr('d', line(mappedData))
      .on('mouseover', function(d: any) {
        const v = { r: d[rkey], t: d[tkey] }
        axis.showTooltip(v)
      })
      .on('mouseout', function(d: any) {
        axis.hideTooltip(d)
      })
      .merge(elements)

    let t = d3
      .transition()
      .duration(this.options.transitionTime)
      .ease(d3.easeLinear)

    elements.transition(t).attr('d', line(mappedData))
  }
}

export class ChartRange extends Chart {
  private previousData: any[] = []

  plotterCartesian(axis: CartesianAxis, dataKeys: any) {
    let xkey = dataKeys.xkey ? dataKeys.xkey : 'x'
    let ykey = dataKeys.ykey ? dataKeys.ykey : 'y'
    let colorkey = dataKeys.colorkey ? dataKeys.colorkey : ykey

    let colorScale = d3.scaleLinear().domain([0, 1])
    if (this.options.colorScale === AUTO_SCALE) {
      colorScale.domain(
        d3.extent(this.data, function(d: any): number {
          return d[colorkey]
        })
      )
    }

    let colorMap = this.colorMap

    let mappedData: any = this.data.map(function(d: any) {
      return {
        x: d[xkey].map(axis.xScale),
        y: d[ykey].map(axis.yScale),
        color: colorMap(colorScale(mean(d[colorkey])))
      }
    })

    this.group = this.selectGroup(axis, 'chart-range')
    let elements: any = this.group.selectAll('rect').data(mappedData)

    let t = d3
      .transition()
      .duration(this.options.transitionTime)
      .ease(d3.easeLinear)

    // exit
    elements.exit().remove()
    // update + enter
    elements
      .enter()
      .append('rect')
      .merge(elements)
      .attr('x', function(d: any) {
        return d.x[0]
      })
      .attr('y', function(d: any) {
        return d.y[1]
      })
      .attr('width', function(d: any) {
        return d.x[1] - d.x[0]
      })
      .attr('height', function(d: any) {
        return d.y[0] - d.y[1]
      })
      .style('fill', function(d: any) {
        return d.color
      })

    elements.transition(t)
  }

  plotterPolar(axis: PolarAxis, dataKeys: any) {
    let canvas = axis.canvas

    let tkey = dataKeys.tkey ? dataKeys.tkey : 't'
    let rkey = dataKeys.rkey ? dataKeys.rkey : 'r'
    let colorkey = dataKeys.colorkey ? dataKeys.colorkey : rkey

    let colorScale = d3.scaleLinear().domain([0, 1])
    if (this.options.colorScale === AUTO_SCALE) {
      colorScale.domain(
        d3.extent(this.data, function(d: any): number {
          return d[colorkey]
        })
      )
    }
    let colorMap = this.colorMap
    let mappedData: any = this.data.map(function(d: any) {
      return {
        r: d[rkey],
        t: d[tkey],
        color: colorMap(colorScale(mean(d[colorkey])))
      }
    })

    let t = d3
      .transition()
      .duration(this.options.transitionTime)
      .ease(d3.easeLinear)

    let arcGenerator = d3
      .arc()
      .innerRadius(function(d: any, i) {
        return axis.radialScale(d.r[0])
      })
      .outerRadius(function(d: any, i) {
        return axis.radialScale(d.r[1])
      })
      .startAngle(function(d: any, i) {
        return axis.angularScale(d.t[0])
      })
      .endAngle(function(d: any, i) {
        return axis.angularScale(d.t[1])
      })

    this.group = this.selectGroup(axis, 'chart-range')

    let elements = this.group.selectAll('path').data(mappedData)

    elements.exit().remove()

    elements
      .enter()
      .append('path')
      .attr('d', arcGenerator)
      .style('fill', function(d: any) {
        return d.color
      })
      .on('mouseover', function(d: any) {
        axis.showTooltip(d)
      })
      .on('mouseout', function(d: any) {
        axis.hideTooltip(d)
      })
      .merge(elements)
    // .attr("d", arcgenerator)

    elements
      .transition(t)
      .style('fill', function(d: any) {
        return d.color
      })
      .call(arcTween, this.previousData)

    this.previousData = mappedData

    function arcTween(transition: any, p: any) {
      transition.attrTween('d', function(d: any, i: number, a: any) {
        let old = p[i]
        if (mean(old.t) - mean(d.t) > 180) {
          old.t = old.t.map(function(x) {
            return x - 360
          })
        } else if (mean(old.t) - mean(d.t) < -180) {
          old.t = old.t.map(function(x) {
            return x + 360
          })
        }

        let tInterpolate = d3.interpolateArray(old.t, d.t)
        let rInterpolate = d3.interpolateArray(old.r, d.r)
        return function(t: any) {
          d.t = tInterpolate(t)
          d.r = rInterpolate(t)
          return arcGenerator(d)
        }
      })
    }
  }
}

export class ChartHistogram extends Chart {
  plotterCartesian(axis: CartesianAxis, dataKeys: any) {
    let canvas = axis.canvas
    let xkey = dataKeys.xkey ? dataKeys.xkey : 'x'
    let ykey = dataKeys.ykey ? dataKeys.ykey : 'y'
    let colorkey = dataKeys.colorkey ? dataKeys.colorkey : ykey
    let data = this.data

    let x0 = (3 * data[0][xkey] - data[1][xkey]) / 2
    let x1 = (-data[data.length - 2][xkey] + 3 * data[data.length - 1][xkey]) / 2
    // axis.xScale.domain([x0, x1])

    let histScale = d3.scaleBand().domain(
      data.map(function(d: any) {
        return d[xkey]
      })
    )
    histScale.range(axis.xScale.range())
    histScale.padding(0.05)

    let colorScale = d3.scaleLinear().domain([0, 1])
    if (this.options.colorScale === AUTO_SCALE) {
      colorScale.domain(
        d3.extent(this.data, function(d: any): number {
          return d[colorkey]
        })
      )
    }

    let colorMap = this.colorMap
    let mappedData: any = this.data.map(function(d: any) {
      return {
        x: d[xkey],
        y: d[ykey],
        color: colorMap(colorScale(d[colorkey]))
      }
    })
    this.group = this.selectGroup(axis, 'chart-range')
    let t = d3
      .transition()
      .duration(this.options.transitionTime)
      .ease(d3.easeLinear)

    let elements: any = this.group.selectAll('rect').data(mappedData)

    // remove
    elements.exit().remove()
    // enter + update
    elements
      .enter()
      .append('rect')
      .style('fill', function(d: any) {
        return d.color
      })
      .attr('y', function(d: any) {
        return axis.yScale(d.y)
      })
      .attr('height', function(d: any) {
        return axis.height - axis.yScale(d.y)
      })

      .merge(elements)
      .attr('x', function(d: any) {
        return histScale(d.x)
      })
      .on('mouseover', function(d: any) {
        axis.showTooltip(d)
      })
      .on('mouseout', function(d: any) {
        axis.hideTooltip(d)
      })
      .attr('width', histScale.bandwidth())

    elements
      .transition(t)
      .style('fill', function(d: any) {
        return d.color
      })
      .attr('y', function(d: any) {
        return isNaN(axis.yScale(d.y)) ? axis.height : axis.yScale(d.y)
      })
      .attr('height', function(d: any) {
        return isNaN(axis.yScale(d.y)) ? 0 : axis.height - axis.yScale(d.y)
      })
  }

  plotterPolar(axis: PolarAxis, dataKeys: any) {
    console.error('plotterPolar is not implemented for ChartHistogram')
  }
}
