import * as d3 from 'd3'
import { Axes } from '../Axes/axes.js'
import { AxisType, CartesianAxes, TooltipPosition } from '../index.js'
import { Visitor } from './visitor.js'
import { dateFormatter } from '../Utils/date.js'
import { setAlphaForColor } from '../Utils/setAlphaForColor.js'
import { SvgPropertiesHyphen } from 'csstype'
import type { DataPointXY } from '../Data/types'

export class MouseOver implements Visitor {
  private trace: string[]
  private group: d3.Selection<SVGElement, unknown, SVGElement, unknown>
  private axes: CartesianAxes
  private mouseGroup: d3.Selection<SVGElement, unknown, SVGElement, unknown>

  constructor(trace?: string[]) {
    this.setTrace(trace)
  }

  setTrace(trace: string[]) {
    this.trace = trace
  }

  visit(axes: Axes): void {
    this.axes = axes as CartesianAxes
    this.create(axes as CartesianAxes)
  }

  create(axes: CartesianAxes): void {
    this.mouseGroup = axes.canvas.select('.mouse')
    // Make sure the <g> mouse group picks up pointer events.
    this.mouseGroup.attr('pointer-events', 'all')

    this.group = axes.canvas
      .insert('g', '.mouse')
      .attr('class', 'mouse-over')
      .attr('font-family', 'sans-serif')

    this.group
      .append('path')
      .attr('class', 'mouse-line')
      .style('opacity', '0')
      .attr('d', function () {
        let d = 'M' + 0 + ',' + axes.height
        d += ' ' + 0 + ',' + 0
        return d
      })

    this.group
      .append('g')
      .attr('class', 'mouse-x')
      .attr('transform', 'translate(' + 0 + ',' + axes.height + ')')
      .append('text')
      .text('')

    this.mouseGroup
      .on('pointerout', () => this.onPointerout())
      .on('pointerover', () => this.onPointerover())
      .on('pointermove', (event) => {
        // mouse moving over canvas
        const mouse = d3.pointer(event)
        this.update(mouse)
      })
  }

  // pointer event handlers
  onPointerout(): void {
    // on mouse out hide line, circles and text
    this.group.select('.mouse-line').style('opacity', '0')
    this.group.selectAll('.mouse-x text').style('fill-opacity', '0')
    for (const chart of this.axes.charts) {
      chart.onPointerOut()
    }
    this.axes.tooltip.hide()
  }

  onPointerover(): void {
    // on mouse in show line, circles and text
    this.axes.tooltip.show()
    this.group.select('.mouse-line').style('opacity', '1')
    const traces =
      this.trace !== undefined
        ? this.trace
        : this.axes.charts.map((chart) => {
            return chart.id
          })
    for (const chart of this.axes.charts) {
      if (traces.includes(chart.id)) {
        chart.onPointerOver()
      } else {
        chart.onPointerOut()
      }
    }
    this.group.select('.mouse-x text').style('fill-opacity', '1')
  }

  updateChartIndicators(mouse: [number, number]): void {
    const traces =
      this.trace !== undefined
        ? this.trace
        : this.axes.charts.map((chart) => {
            return chart.id
          })

    const points: { point: DataPointXY; style: SvgPropertiesHyphen, axisIndex: number }[] = []
    const seen = new Set()
    for (const chart of this.axes.charts) {
      if (traces.includes(chart.id) && chart.visible && !seen.has(chart.id)) {
        const xIndex = chart.axisIndex.x.axisIndex
        const xScale = this.axes.xScales[xIndex]
        const yIndex = chart.axisIndex.y.axisIndex
        const yScale = this.axes.yScales[yIndex]
        const point = chart.onPointerMove(xScale.invert(mouse[0]), xScale, yScale)
        if (point) {
          points.push({ ...point, axisIndex: yIndex })
        }
      }
      seen.add(chart.id)
    }
    this.updateTooltip(points, mouse)
  }

  update(mouse: [number, number]) {
    // update line
    this.updateXLine(mouse[0])
    this.updateXValue(mouse[0])
    this.updateChartIndicators(mouse)
  }

  updateXLine(xPos: number) {
    this.group.select('.mouse-line').attr('transform', 'translate(' + xPos + ',' + 0 + ')')
  }

  updateXValue(xPos) {
    const axes = this.axes
    this.group
      .select('.mouse-x')
      .attr('transform', 'translate(' + (xPos + 2) + ',' + (axes.height - 5) + ')')
      .select('text')
      .text(this.xText(axes, xPos))
  }

  updateTooltip(
    pointData: { point: DataPointXY; style: SvgPropertiesHyphen, axisIndex: number }[],
    mouse: [number, number]
  ) {
    const axes = this.axes
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
          const extent = this.axes.chartsExtent('y', item.axisIndex, {})
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
        mouse[1] + axes.margin.top
      )
      if (axes.tooltip.isHidden) {
        axes.tooltip.show()
      }
    }
  }

  private valueLabel(extent: number[], value: number | number[]) {
    const s = d3.formatSpecifier('f')
    s.precision = d3.precisionFixed((extent[1] - extent[0]) / 100)
    if (Array.isArray(value)) {
      const labels: string[] = [...value]
        .sort((a, b) => a - b)
        .map((v) => d3.format(s.toString())(v))
      return labels.join('–')
    } else {
      return d3.format(s.toString())(value)
    }
  }

  private xText(axes: CartesianAxes, xPos: number): string {
    let text = ''
    switch (axes.options.x[0].type) {
      case AxisType.time:
        text = dateFormatter(axes.xScales[0].invert(xPos), 'yyyy-MM-dd HH:mm ZZZZ', {
          timeZone: axes.options.x[0].timeZone,
          locale: axes.options.x[0].locale,
        })
        break
      default:
        const s = d3.formatSpecifier('f')
        s.precision = d3.precisionFixed(axes.xScales[0].domain()[1] / 100)
        text = d3.format(s.toString())(axes.xScales[0].invert(xPos))
        break
    }
    return text
  }

  redraw(): void {
    this.group.select('.mouse-line').attr('d', () => {
      let d = 'M' + 0 + ',' + this.axes.height
      d += ' ' + 0 + ',' + 0
      return d
    })
    for (const chart of this.axes.charts) {
      chart.onPointerOut()
    }
  }
}
