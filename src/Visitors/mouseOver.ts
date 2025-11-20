import * as d3 from 'd3'
import { Axes } from '../Axes/axes.js'
import { AxisType, CartesianAxes, TooltipPosition } from '../index.js'
import { Visitor } from './visitor.js'
import { dateFormatter } from '../Utils/date.js'
import { setAlphaForColor } from '../Utils/setAlphaForColor.js'
import { SvgPropertiesHyphen } from 'csstype'
import type { DataPointXY } from '../Data/types'

type Group = d3.Selection<SVGElement, unknown, SVGElement, unknown>

interface AxesGroup {
  axes: CartesianAxes
  group: Group
}

type Trace = string[]

export interface MouseOverOptions {
  trace?: Trace
  shared: boolean
}

function isTrace(param: unknown): param is Trace {
  return Array.isArray(param) && param.every((item) => typeof item === 'string')
}

export class MouseOver implements Visitor {
  private options: MouseOverOptions
  private axesGroups: AxesGroup[]
  private customNumberFormatter: ((value: number, extent?: [number, number]) => string) | null

  constructor(trace?: string[]);
  constructor(options?: Partial<MouseOverOptions>);
  constructor(param?: string[] | Partial<MouseOverOptions>) {
    this.options = {
      shared: false,
    }

    if (isTrace(param)) {
      this.options.trace = param
    } else {
      this.options = { ...this.options, ...param }
    }

    this.axesGroups = []
  }

  visit(axes: Axes): void {
    const cartesianAxes = axes as CartesianAxes
    this.axesGroups.push(this.create(cartesianAxes))
  }

  create(axes: CartesianAxes): AxesGroup {
    const mouseGroup = axes.canvas.select('.mouse')
    // Make sure the <g> mouse group picks up pointer events.
    mouseGroup.attr('pointer-events', 'all')

    const group = axes.canvas
      .insert('g', '.mouse')
      .attr('class', 'mouse-over')
      .attr('font-family', 'sans-serif')

    group
      .append('path')
      .attr('class', 'mouse-line')
      .style('opacity', '0')
      .attr('d', function () {
        let d = 'M' + 0 + ',' + axes.height
        d += ' ' + 0 + ',' + 0
        return d
      })

    group
      .append('g')
      .attr('class', 'mouse-x')
      .attr('transform', 'translate(' + 0 + ',' + axes.height + ')')
      .append('text')
      .text('')

    const axesGroup = { axes, group }
    const axesGroups = this.options.shared ? this.axesGroups : [axesGroup]
    mouseGroup
      .on('pointerout', () => axesGroups.forEach((axesGroup) => this.onPointerout(axesGroup)))
      .on('pointerover', () => axesGroups.forEach((axesGroup) => this.onPointerover(axesGroup)))
      .on('pointermove', (event) => {
        // mouse moving over canvas
        const mouse = d3.pointer(event)
        axesGroups.forEach((axesGroup) => this.update(axesGroup, mouse))
      })
    return axesGroup
  }

  // pointer event handlers
  onPointerout({ axes, group }: AxesGroup): void {
    // on mouse out hide line, circles and text
    group.select('.mouse-line').style('opacity', '0')
    group.selectAll('.mouse-x text').style('fill-opacity', '0')
    for (const chart of axes.charts) {
      chart.onPointerOut()
    }
    axes.tooltip.hide()
  }

  onPointerover({ axes, group }: AxesGroup): void {
    // on mouse in show line, circles and text
    axes.tooltip.show()
    group.select('.mouse-line').style('opacity', '1')
    const traces = this.options.trace ?? axes.charts.map((chart) => chart.id)
    for (const chart of axes.charts) {
      if (traces.includes(chart.id)) {
        chart.onPointerOver()
      } else {
        chart.onPointerOut()
      }
    }
    group.select('.mouse-x text').style('fill-opacity', '1')
  }

  updateChartIndicators(axesGroup: AxesGroup, mouse: [number, number]): void {
    const { axes } = axesGroup
    const traces = this.options.trace ?? axes.charts.map((chart) => chart.id)

    const spanElements: HTMLSpanElement[] = []
    const seen = new Set()
    for (const chart of axes.charts) {
      if (traces.includes(chart.id) && chart.visible && !seen.has(chart.id)) {
        const xIndex = chart.axisIndex.x.axisIndex
        const xScale = axes.xScales[xIndex]
        const yIndex = chart.axisIndex.y.axisIndex
        const yScale = axes.yScales[yIndex]
        const point = chart.onPointerMove(xScale.invert(mouse[0]), xScale, yScale)
        if (point) {
          points.push({ ...point, axisIndex: yIndex })
        }
      }
      seen.add(chart.id)
    }
    this.updateTooltip(axesGroup, points, mouse)
  }

  update(axesGroup: AxesGroup, mouse: [number, number]) {
    // update line
    this.updateXLine(axesGroup, mouse[0])
    this.updateXValue(axesGroup, mouse[0])
    this.updateChartIndicators(axesGroup, mouse)
  }

  updateXLine({ group }: AxesGroup, xPos: number) {
    group.select('.mouse-line').attr('transform', 'translate(' + xPos + ',' + 0 + ')')
  }

  updateXValue({ axes, group }: AxesGroup, xPos: number) {
    group
      .select('.mouse-x')
      .attr('transform', 'translate(' + (xPos + 2) + ',' + (axes.height - 5) + ')')
      .select('text')
      .text(this.xText(axes, xPos))
  }

  updateTooltip(
    { axes }: AxesGroup,
    pointData: { point: DataPointXY; style: SvgPropertiesHyphen, axisIndex: number }[],
    mouse: [number, number]
  ) {
    if (Object.keys(pointData).length === 0) {
      axes.tooltip.hide()
    } else {
      const htmlContent = document.createElement('div')
      for (const item of pointData) {
        let color = item.style?.color
        if (color) {
          color = setAlphaForColor(color, 1)
        }
        const value = item.point
        if (value.y !== undefined) {
          const extent = axes.chartsExtent('y', item.axisIndex, {})
          let label = ''
          const yValue = value.y
          if (yValue instanceof Date) {
            label = dateFormatter(yValue, 'yyyy-MM-dd HH:mm ZZZZ', {
              timeZone: axes.options.x[0].timeZone,
              locale: axes.options.x[0].locale,
            })
          } else {
            label = this.valueLabel(extent, yValue)
          }
          const spanElement = document.createElement('span')
          spanElement.style.color = color
          spanElement.innerText = label
          htmlContent.appendChild(spanElement)
          htmlContent.appendChild(document.createElement('br'))
        }
      }
      axes.tooltip.update(
        htmlContent,
        TooltipPosition.Right,
        mouse[0] + axes.margin.left,
        mouse[1] + axes.margin.top,
      )
      if (axes.tooltip.isHidden) {
        axes.tooltip.show()
      }
    }
  }

  private xText(axes: CartesianAxes, xPos: number): string {
    if (axes.options.x[0].type === AxisType.time) {
      return dateFormatter(axes.xScales[0].invert(xPos), 'yyyy-MM-dd HH:mm ZZZZ', {
        timeZone: axes.options.x[0].timeZone,
        locale: axes.options.x[0].locale,
      })
    } else {
      const s = d3.formatSpecifier('f')
      const xDomain = axes.xScales[0].domain()
      s.precision = d3.precisionFixed(xDomain[1] / 100)

      // Pass the x-domain as the extent for the formatting.
      const formatNumber =
        this.customNumberFormatter !== null
          ? (value: number) => this.customNumberFormatter(value, xDomain as [number, number])
          : d3.format(s.toString())
      return formatNumber(axes.xScales[0].invert(xPos))
    }
  }

  redraw(): void {
    this.axesGroups.forEach(({axes, group}) => {
      group.select('.mouse-line').attr('d', () => {
        let d = 'M' + 0 + ',' + axes.height
        d += ' ' + 0 + ',' + 0
        return d
      })
      for (const chart of axes.charts) {
        chart.onPointerOut()
      }
    })
  }
}
