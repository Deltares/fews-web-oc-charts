import * as d3 from 'd3'
import { Axes } from '../Axes/axes.js'
import { AxisType, CartesianAxes } from '../index.js';
import { Visitor } from './visitor.js'
import { TooltipPosition } from '../Tooltip/tooltip.js'
import { dateFormatter } from '../Utils/date.js'
import { isNull } from 'lodash-es'

function distanceSquared(x0, x1) {
  return (x0 - x1) ** 2
}

export class MouseOver implements Visitor {
  private trace: string[]
  private group: d3.Selection<SVGElement, unknown, SVGElement, unknown>
  private axes: CartesianAxes
  private mouseGroup: d3.Selection<SVGElement, unknown, SVGElement, unknown>
  private mousePerLine!: d3.Selection<d3.BaseType, string, SVGElement, unknown>

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

    this.group = axes.canvas.insert('g', '.mouse')
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
    this.group.selectAll('.mouse-per-line circle').style('opacity', '0')
    this.group.selectAll('.mouse-x text').style('fill-opacity', '0')
    this.axes.tooltip.hide()
  }


  onPointerover(): void {
    // on mouse in show line, circles and text
    this.axes.tooltip.show()
    this.group.select('.mouse-line').style('opacity', '1')
    this.group
      .selectAll('.mouse-per-line circle')
      .style('opacity', '1')
      .style('fill', (d: string) => {
        const selector = `[data-chart-id="${d}"]`
        const element = this.axes.chartGroup.select(selector).select('path')
        if (element.node() === null) return
        return window
          .getComputedStyle(element.node() as Element)
          .getPropertyValue('stroke')
      })
    this.group.select('.mouse-x text').style('fill-opacity', '1')
  }

  xPosForCharts(mouse) {
    const axes = this.axes
    let rMin = Infinity
    let xPos = mouse[0]
    this.mousePerLine
      .each(d => {
        const selector = `[data-chart-id="${d}"]`
        const element = axes.canvas
          .selectAll<SVGElement, any>(selector)
          .select<SVGElement>('path')
        if (element.node() !== null) {
          if (this.isHidden(element) || element.datum().length === 0) {
            //skip
          } else {
            const datum = element.datum();
            [xPos, rMin] = this.closestPointForChart(d, datum, mouse[0], xPos, rMin)
          }
        }
      })
    return xPos
  }

  isHidden(element) {
    const style = window.getComputedStyle(element.node() as Element)
    return style === null || style.getPropertyValue('visibility') === 'hidden'
  }


  closestPointForChart(id: string, datum: any[], x: number, xPos: number, rMin: number) {
    const axis = this.axes
    const chart = axis.charts.find(c => c.id === id)
    const xIndex = chart.axisIndex.x.axisIndex
    const xScale = axis.xScales[xIndex]
    const mouseValue = xScale.invert(x)
    const xKey = chart.dataKeys.x
    const yKey = chart.dataKeys.y
    let yIsNull = (d) => isNull(d[yKey])
    if (Array.isArray(datum[0][yKey])) {
      yIsNull = (d) => {
        return isNull(d[yKey][0])
      }
    }
    const bisect = d3.bisector((data) => {
      return data[xKey]
    }).right
    const idx = bisect(datum, mouseValue)
    if (idx - 1 >= 0 && !yIsNull(datum[idx - 1])[yKey]) {
      const x0 = xScale(datum[idx - 1][xKey])
      const r0 =  distanceSquared(x0, x)
      if (r0 < rMin) {
        rMin = r0
        xPos = x0
      }
    }
    if (idx < datum.length && !yIsNull(datum[idx])[yKey]) {
      const x1 = xScale(datum[idx][xKey])
      const r1 = distanceSquared(x1, x)
      if (r1 < rMin) {
        rMin = r1
        xPos = x1
      }
    }
    return [xPos, rMin]
  }

  update(mouse) {
    // update line
    this.updateXLine(mouse[0])
    this.updateXValue(mouse[0])
  }

  findIndex(datum, xKey, yKey, xValue) {
    const bisect = d3.bisector((data) => {
      return data[xKey]
    }).left

    let yIsNull = (d) => isNull(d[yKey])
    if (Array.isArray(datum[0][yKey])) {
      yIsNull = (d) => {
        return isNull(d[yKey][0])
      }
    }
    const idx = bisect(datum, xValue)
    // before first point
    if (idx === 0 && datum[idx][xKey] > xValue) {
      return
    }
    // after last point
    if (idx === datum.length - 1 && datum[idx][xKey] < xValue) {
      return
    }
    if (!datum[idx] || yIsNull(datum[idx])) {
      return
    }
    return idx
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

  private xText(axes: CartesianAxes, xPos: any): string {
    let text = ''
    switch (axes.options.x[0].type) {
      case AxisType.time:
        text = dateFormatter(axes.xScales[0].invert(xPos), 'yyyy-MM-dd HH:mm ZZZZ', { timeZone: axes.options.x[0].timeZone, locale: axes.options.x[0].locale });
        break
      default:
        const s = d3.formatSpecifier("f")
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
  }
}
