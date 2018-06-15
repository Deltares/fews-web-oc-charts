import * as d3 from 'd3'
import { scaleLinear } from 'd3-scale'

export const CLOCKWISE = 1
export const ANTICLOCKWISE = -1
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
  innerRadius?: number
}

export interface CartesianAxisOptions extends AxisOptions {
  yScale?: number | number[]
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

  public setxDomain(domain: Array<number | { valueOf(): number }>) {
    let currentDomain = this.xScale.domain()
    this.xScale.domain([
      d3.min([domain[0], currentDomain[0]]),
      d3.max([domain[1], currentDomain[1]])
    ])
  }

  redraw() {
    for (let chart of this.charts) {
      chart.plotterCartesian(this, chart.options)
    }
  }

  updateGrid() {
    let g = this.canvas
    let xAxis = d3.axisBottom(this.xScale)
    xAxis.ticks(5)
    let horizontalAxis = this.canvas.select('.x-axis').call(xAxis)
    let xticks = this.xScale.ticks().map(this.xScale)
    let xGrid: any = this.canvas
      .select('.x-grid')
      .selectAll('line')
      .data(xticks)

    xGrid.exit().remove()

    xGrid
      .enter()
      .append('line')
      .merge(xGrid)
      .attr('x1', function(d: number) {
        return d
      })
      .attr('y1', this.height)
      .attr('x2', function(d: number) {
        return d
      })
      .attr('y2', 0)

    let yAxis = d3.axisLeft(this.yScale).ticks(5)
    let verticalAxis = this.canvas.select('.y-axis').call(yAxis)
    let yticks = this.yScale.ticks(5).map(this.yScale)

    let yGrid: any = this.canvas
      .select('.y-grid')
      .selectAll('line')
      .data(yticks)
    yGrid.exit().remove()
    yGrid
      .enter()
      .append('line')
      .merge(yGrid)
      .attr('x1', 0)
      .attr('y1', function(d: number) {
        return d
      })
      .attr('x2', this.width)
      .attr('y2', function(d: number) {
        return d
      })
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
    this.updateGrid()
  }
}

export class PolarAxis extends Axis {
  radialScale: any
  angularScale: any
  direction: number
  outerRadius: number
  innerRadius: number
  angularRange: number[]

  constructor(container: HTMLElement, width: number, height: number, options?: PolarAxisOptions) {
    super(container, width, height, options)
    this.canvas = this.canvas
      .append('g')
      .attr('transform', 'translate(' + this.width / 2 + ',' + this.height / 2 + ' )')

    this.direction = options.direction ? options.direction : ANTICLOCKWISE
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
    for (let chart of this.charts) {
      chart.plotterPolar(this, chart.datakeys)
    }
  }

  radToDegrees(value: number) {
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
  }

  showTooltip(d: any) {
    this.tooltip
      .transition()
      .duration(50)
      .style('opacity', 0.9)
    this.tooltip
      .html('t: ' + d.t[0].toFixed(2) + '<br/>' + 'r: ' + d.r[0].toFixed(2))
      .style('left', d3.event.pageX + 'px')
      .style('top', d3.event.pageY + 'px')
  }

  protected setRange() {
    this.radialScale = d3
      .scaleLinear()
      .domain([0, 1])
      .range([this.innerRadius, this.outerRadius])
    this.angularScale = d3
      .scaleLinear()
      .domain([0, 360])
      .range(this.angularRange)
  }

  protected initGrid() {
    let radialGrid = this.canvas.append('g').attr('class', 'r-grid')
    let angularGrid = this.canvas.append('g').attr('class', 't-grid')
    let radialAxis = this.canvas.append('g').attr('class', 'r-axis')
    let angularAxis = this.canvas.append('g').attr('class', 't-axis')
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
  datakeys: any

  constructor(data: any, options: any) {
    this.data = data
    this.options = options
    // https://github.com/d3/d3-scale-chromatic
    this.colorMap = d3.scaleSequential(d3.interpolateWarm)
  }

  addTo(axis: Axis, datakeys: any, id?: string) {
    this.id = id ? id : ''
    this.datakeys = datakeys
    axis.charts.push(this)
    if (axis instanceof CartesianAxis) {
      this.plotterCartesian(axis, datakeys)
    } else if (axis instanceof PolarAxis) {
      this.plotterPolar(axis, datakeys)
    }
    axis.updateGrid()
    return this
  }

  abstract plotterCartesian(axis: CartesianAxis, datakeys: any)
  abstract plotterPolar(axis: PolarAxis, datakeys: any)

  protected selectGroup(axis: Axis, cssClass: string) {
    this.group =
      this.group != null
        ? this.group
        : axis.canvas
            .append('g')
            .attr('class', cssClass)
            .attr('id', this.id)
    return this.group
  }

  protected mapDataCartesian(axis: CartesianAxis, datakeys: any) {
    let xkey = datakeys.xkey ? datakeys.xkey : 'x'
    let ykey = datakeys.ykey ? datakeys.ykey : 'y'

    // axis.setxDomain(d3.extent(this.data, function (d: any) { return d[xkey]})  )
    axis.yScale.domain(
      d3.extent(this.data, function(d: any) {
        return d[ykey]
      })
    )

    let mappedData: any = this.data.map(function(d: any) {
      return {
        x: axis.xScale(d[xkey]),
        y: axis.yScale(d[ykey])
      }
    })
    return mappedData
  }

  protected mapDataPolar(axis: PolarAxis, datakeys: any) {
    let tkey = datakeys.tkey ? datakeys.tkey : 't'
    let rkey = datakeys.rkey ? datakeys.rkey : 'r'

    axis.angularScale.domain(
      d3.extent(this.data, function(d: any) {
        return d[tkey]
      })
    )
    axis.radialScale.domain(
      d3.extent(this.data, function(d: any) {
        return d[rkey]
      })
    )

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
  plotterCartesian(axis: CartesianAxis, datakeys: any) {
    let mappedData = this.mapDataCartesian(axis, datakeys)
    this.group = this.selectGroup(axis, 'chart-marker')
    let elements = this.group
      .selectAll('.symbol')
      .data(mappedData)
      .enter()
      .append('path')
      .attr('transform', function(d: any, i: number) {
        return 'translate(' + d.x + ',' + d.y + ')'
      })
      .attr(
        'd',
        d3.symbol().type(function(d, i) {
          return d3.symbols[i % 7]
        })
      )
  }

  plotterPolar(axis: PolarAxis, datakeys: any) {
    let mappedData = this.mapDataPolar(axis, datakeys)
    this.group = this.selectGroup(axis, 'chart-marker')
    let elements = this.group
      .selectAll('.symbol')
      .data(mappedData)
      .enter()
      .append('path')
      .attr('transform', function(d: any, i: number) {
        return 'translate(' + d.r * Math.cos(d.t) + ',' + d.r * Math.sin(d.t) + ')'
      })
      .attr(
        'd',
        d3.symbol().type(function(d, i) {
          return d3.symbols[i % 7]
        })
      )
      .on('mouseover', function(d: any) {
        axis.showTooltip(d)
      })
      .on('mouseout', function(d: any) {
        axis.hideTooltip(d)
      })
  }
}

export class ChartLine extends Chart {
  plotterCartesian(axis: CartesianAxis, datakeys: any) {
    let mappedData = this.mapDataCartesian(axis, datakeys)
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
    let elements = this.group.append('path').attr('d', line(mappedData))
  }

  plotterPolar(axis: PolarAxis, datakeys: any) {
    let mappedData = this.mapDataPolar(axis, datakeys)
    let line = d3
      .lineRadial()
      .angle(function(d: any) {
        return d.t
      })
      .radius(function(d: any) {
        return d.r
      })
    this.group = this.selectGroup(axis, 'chart-line')
    let elements = this.group
      .append('path')
      .attr('d', line(mappedData))
      .on('mouseover', function(d: any) {
        axis.showTooltip(d)
      })
      .on('mouseout', function(d: any) {
        axis.hideTooltip(d)
      })
  }
}

export class ChartRange extends Chart {
  plotterCartesian(axis: CartesianAxis, datakeys: any) {
    let xkey = datakeys.xkey ? datakeys.xkey : 'x'
    let ykey = datakeys.ykey ? datakeys.ykey : 'y'
    let colorkey = datakeys.colorkey ? datakeys.colorkey : ykey

    if (axis.options.xScale === AUTO_SCALE) {
      axis.yScale.domain([
        d3.min(this.data, function(d: any) {
          return d[ykey][0]
        }),
        d3.max(this.data, function(d: any) {
          return d[ykey][1]
        })
      ])
    }
    if (axis.options.yScale === AUTO_SCALE) {
      axis.yScale.domain([
        d3.min(this.data, function(d: any) {
          return d[ykey][0]
        }),
        d3.max(this.data, function(d: any) {
          return d[ykey][1]
        })
      ])
    }

    let colorScale = d3.scaleLinear().domain([0, 4])
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
      .duration(750)
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

  plotterPolar(axis: PolarAxis, datakeys: any) {
    let canvas = axis.canvas

    let tkey = datakeys.tkey ? datakeys.tkey : 't'
    let rkey = datakeys.rkey ? datakeys.rkey : 'r'
    let colorkey = datakeys.colorkey ? datakeys.colorkey : rkey

    if (axis.options.radialScale === AUTO_SCALE) {
      axis.radialScale.domain([
        d3.min(this.data, function(d: any) {
          console.log(d[rkey])
          return d[rkey][0]
        }),
        d3.max(this.data, function(d: any) {
          return d[rkey][1]
        })
      ])
      axis.updateGrid()
    }

    let colorScale = d3.scaleLinear().domain([0, 4])
    let colorMap = this.colorMap

    let mappedData: any = this.data.map(function(d: any) {
      return {
        r: d[rkey].map(axis.radialScale),
        t: d[tkey].map(axis.angularScale),
        color: colorMap(colorScale(mean(d[colorkey])))
      }
    })

    let t = d3
      .transition()
      .duration(750)
      .ease(d3.easeLinear)

    let arcgenerator = d3
      .arc()
      .innerRadius(function(d: any, i) {
        return d.r[0]
      })
      .outerRadius(function(d: any, i) {
        return d.r[1]
      })
      .startAngle(function(d: any, i) {
        return d.t[0]
      })
      .endAngle(function(d: any, i) {
        return d.t[1]
      })

    this.group = this.selectGroup(axis, 'chart-range')

    let previousData: any[] = []
    let temp = this.group.selectAll('path')
    temp.each(function(p: any) {
      previousData.push(p)
    })

    let elements = this.group.selectAll('path').data(mappedData)

    elements.exit().remove()

    elements
      .enter()
      .append('path')
      .attr('d', arcgenerator)
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
      .call(arcTween, previousData)

    function arcTween(transition: any, p: any) {
      transition.attrTween('d', function(d: any, i: number, a: any) {
        let tInterpolate = d3.interpolateArray(p[i].t, d.t)
        let rInterpolate = d3.interpolateArray(p[i].r, d.r)
        return function(t: any) {
          d.t = tInterpolate(t)
          d.r = rInterpolate(t)
          return arcgenerator(d)
        }
      })
    }
  }
}

export class ChartHistogram extends Chart {
  plotterCartesian(axis: CartesianAxis, datakeys: any) {
    let canvas = axis.canvas
    let xkey = datakeys.xkey ? datakeys.xkey : 'x'
    let ykey = datakeys.ykey ? datakeys.ykey : 'y'
    let colorkey = datakeys.colorkey ? datakeys.colorkey : ykey
    let data = this.data

    let x0 = (3 * data[0][xkey] - data[1][xkey]) / 2
    let x1 = (-data[data.length - 2][xkey] + 3 * data[data.length - 1][xkey]) / 2
    axis.xScale.domain([x0, x1])
    axis.setxDomain([x0, x1])

    if (axis.options.yScale === AUTO_SCALE) {
      axis.yScale.domain(
        d3.extent(this.data, function(d: any) {
          return d[ykey]
        })
      )
      axis.updateGrid()
    }

    let histScale = d3.scaleBand().domain(
      data.map(function(d: any) {
        return d[xkey]
      })
    )
    histScale.range([0, axis.width])
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
      .duration(750)
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
        return axis.yScale(d.y)
      })
      .attr('height', function(d: any) {
        return axis.height - axis.yScale(d.y)
      })
  }

  plotterPolar(axis: PolarAxis, datakeys: any) {
    console.error('plotterPolar is not implemented for ChartHistogram')
  }
}
