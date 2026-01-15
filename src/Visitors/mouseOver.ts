import * as d3 from 'd3'
import { Axes } from '../Axes/axes.js'
import { AxisType, CartesianAxes, TooltipPosition } from '../index.js'
import { Visitor } from './visitor.js'
import { dateFormatter } from '../Utils/date.js'

export enum MouseOverDirection {
  Horizontal = 'horizontal',
  Vertical = 'vertical',
}

interface MouseOverOptions {
  trace?: string[]
  numberFormatter?: (value: number, extent?: [number, number]) => string
  direction?: MouseOverDirection
}

export class MouseOver implements Visitor {
  private trace: string[] | undefined
  private group: d3.Selection<SVGElement, unknown, SVGElement, unknown>
  private axes: CartesianAxes
  private mouseGroup: d3.Selection<SVGElement, unknown, SVGElement, unknown>
  private customNumberFormatter: ((value: number, extent?: [number, number]) => string) | null
  private direction: MouseOverDirection

  constructor(options: MouseOverOptions = {}) {
    this.setTrace(options.trace)
    this.customNumberFormatter = options.numberFormatter ?? null
    this.direction = options.direction ?? MouseOverDirection.Horizontal
  }

  setTrace(trace: string[] | undefined) {
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
      .attr('d', () => {
        if (this.direction === MouseOverDirection.Vertical) {
          // horizontal line
          return `M${axes.width},0 0,0`
        } else {
          // vertical line
          return `M0,${axes.height} 0,0`
        }
      })

    if (this.direction === MouseOverDirection.Vertical) {
      this.group.append('g').attr('class', 'mouse-y').append('text').text('')
    } else {
      this.group
        .append('g')
        .attr('class', 'mouse-x')
        .attr('transform', `translate(0,${axes.height})`)
        .append('text')
        .text('')
    }

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

    if (this.direction === MouseOverDirection.Vertical) {
      this.group.select('.mouse-y text').style('fill-opacity', '0')
    } else {
      this.group.select('.mouse-x text').style('fill-opacity', '0')
    }

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
    if (this.direction === MouseOverDirection.Vertical) {
      this.group.select('.mouse-y text').style('fill-opacity', '1')
    } else {
      this.group.select('.mouse-x text').style('fill-opacity', '1')
    }
  }

  updateChartIndicators(mouse: [number, number]): void {
    const traces =
      this.trace !== undefined
        ? this.trace
        : this.axes.charts.map((chart) => {
            return chart.id
          })

    const key = this.direction === MouseOverDirection.Vertical ? 'y' : 'x'
    const inverseKey = this.direction === MouseOverDirection.Vertical ? 'x' : 'y'

    const spanElements: HTMLSpanElement[] = []
    const seen = new Set()
    for (const chart of this.axes.charts) {
      if (traces.includes(chart.id) && chart.visible && !seen.has(chart.id)) {
        const xIndex = chart.axisIndex.x.axisIndex
        const xScale = this.axes.xScales[xIndex]

        const yIndex = chart.axisIndex.y.axisIndex
        const yScale = this.axes.yScales[yIndex]

        const extent = this.axes.chartsExtent(inverseKey, chart.axisIndex[inverseKey].axisIndex, {})
        const precision = d3.precisionFixed((extent[1] - extent[0]) / 100)

        const value =
          this.direction === MouseOverDirection.Vertical
            ? yScale.invert(mouse[1])
            : xScale.invert(mouse[0])
        const pointData = chart.onPointerMove(value, key, xScale, yScale)

        const spanElement: HTMLSpanElement | undefined = chart.mouseOverFormatterCartesian(
          inverseKey,
          pointData,
          precision,
        )
        if (spanElement) {
          spanElements.push(spanElement)
        }
      }
      seen.add(chart.id)
    }
    this.updateTooltip(spanElements, mouse)
  }

  update(mouse: [number, number]) {
    if (this.direction === MouseOverDirection.Vertical) {
      this.updateYLine(mouse[1])
      this.updateYValue(mouse[1])
    } else {
      this.updateXLine(mouse[0])
      this.updateXValue(mouse[0])
    }

    this.updateChartIndicators(mouse)
  }

  updateXLine(xPos: number) {
    this.group.select('.mouse-line').attr('transform', `translate(${xPos},0)`)
  }

  updateXValue(xPos: number) {
    const axes = this.axes
    this.group
      .select('.mouse-x')
      .attr('transform', `translate(${xPos + 2},${axes.height - 5})`)
      .select('text')
      .text(this.xText(axes, xPos))
  }

  updateYLine(yPos: number) {
    this.group.select('.mouse-line').attr('transform', `translate(0,${yPos})`)
  }

  updateYValue(yPos: number) {
    const axes = this.axes
    this.group
      .select('.mouse-y')
      .attr('transform', `translate(2,${yPos - 2})`)
      .select('text')
      .text(this.yText(axes, yPos))
  }

  updateTooltip(spanElements: HTMLSpanElement[], mouse: [number, number]) {
    const axes = this.axes
    if (spanElements.length === 0) {
      axes.tooltip.hide()
    } else {
      const htmlContent = document.createElement('div')
      for (const span of spanElements) {
        htmlContent.appendChild(span)
        htmlContent.appendChild(document.createElement('br'))
      }
      axes.tooltip.update(
        htmlContent,
        this.direction === MouseOverDirection.Vertical
          ? TooltipPosition.Top
          : TooltipPosition.Right,
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

  private yText(axes: CartesianAxes, yPos: number): string {
    if (axes.options.y[0].type === AxisType.time) {
      return dateFormatter(axes.yScales[0].invert(yPos), 'yyyy-MM-dd HH:mm ZZZZ', {
        timeZone: axes.options.y[0].timeZone,
        locale: axes.options.y[0].locale,
      })
    } else {
      const s = d3.formatSpecifier('f')
      const yDomain = axes.yScales[0].domain()
      s.precision = d3.precisionFixed(yDomain[1] / 100)

      const formatNumber =
        this.customNumberFormatter !== null
          ? (value: number) => this.customNumberFormatter(value, yDomain as [number, number])
          : d3.format(s.toString())

      return formatNumber(axes.yScales[0].invert(yPos))
    }
  }

  redraw(): void {
    this.group.select('.mouse-line').attr('d', () => {
      if (this.direction === MouseOverDirection.Vertical) {
        return `M${this.axes.width},0 0,0`
      } else {
        return `M0,${this.axes.height} 0,0`
      }
    })
    for (const chart of this.axes.charts) {
      chart.onPointerOut()
    }
  }
}
