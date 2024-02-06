import * as d3 from 'd3'
import { Axes } from '../Axes/axes.js'
import { AxisType, CartesianAxes } from '../index.js';
import { Visitor } from './visitor.js'
import { TooltipPosition } from '../Tooltip/tooltip.js'
import { dateFormatter } from '../Utils/date.js'
import { isNull } from 'lodash-es'

function distanceSquared(y0, y1) {
  return (y0 - y1) ** 2
}

export class VerticalMouseOver implements Visitor {
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
        let d = 'M' + axes.width + ',' + 0
        d += ' ' + 0 + ',' + 0
        return d
      })

    this.group
      .append('g')
      .attr('class', 'mouse-y')
      .append('text')
      .text('')

    this.updateLineIndicators()

    this.mouseGroup
      .on('pointerout', () => this.onPointerout())
      .on('pointerover', () => this.onPointerover())
      .on('pointermove', (event) => {
        // mouse moving over canvas
        const mouse = d3.pointer(event)
        // determine closest point over all lines
        const yPos = this.yPosForCharts(mouse)
        this.update(mouse, yPos)
      })
  }

  // pointer event handlers
  onPointerout(): void {
    // on mouse out hide line, circles and text
    this.group.select('.mouse-line').style('opacity', '0')
    this.group.selectAll('.mouse-per-line circle').style('opacity', '0')
    this.group.selectAll('.mouse-y text').style('fill-opacity', '0')
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
    this.group.select('.mouse-y text').style('fill-opacity', '1')
  }

  yPosForCharts(mouse) {
    const axes = this.axes
    let rMin = Infinity
    let yPos = mouse[1]
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
            [yPos, rMin] = this.closestPointForChart(d, datum, mouse[1], yPos, rMin)
          }
        }
      })
    return yPos
  }

  isHidden(element) {
    const style = window.getComputedStyle(element.node() as Element)
    return style === null || style.getPropertyValue('visibility') === 'hidden'
  }


  closestPointForChart(id: string, datum: any[], y: number, yPos: number, rMin: number) {
    const axis = this.axes
    const chart = axis.charts.find(c => c.id === id)
    const yIndex = chart.axisIndex.y.axisIndex
    const yScale = axis.yScales[yIndex]
    const mouseValue = yScale.invert(y)
    const xKey = chart.dataKeys.x
    const yKey = chart.dataKeys.y
    let xIsNull = (d) => isNull(d[xKey])
    if (Array.isArray(datum[0][xKey])) {
      xIsNull = (d) => {
        return isNull(d[xKey][0])
      }
    }
    const bisect = d3.bisector((data) => {
      return data[yKey]
    }).right
    const idx = bisect(datum, mouseValue)
    if (idx - 1 >= 0 && !xIsNull(datum[idx - 1])[xKey]) {
      const y0 = yScale(datum[idx - 1][yKey])
      const r0 =  distanceSquared(y0, y)
      if (r0 < rMin) {
        rMin = r0
        yPos = y0
      }
    }
    if (idx < datum.length && !xIsNull(datum[idx])[xKey]) {
      const y1 = yScale(datum[idx][yKey])
      const r1 = distanceSquared(y1, y)
      if (r1 < rMin) {
        rMin = r1
        yPos = y1
      }
    }
    return [yPos, rMin]
  }

  update(mouse, yPos) {
    const axis = this.axes
    const pointData = {}

    this.mousePerLine.each((d, i) => {
      const selector = `[data-chart-id="${d}"]`
      const chart = axis.charts.find(c => c.id === d)
      const xIndex = chart.axisIndex.x.axisIndex
      const xScale = axis.xScales[xIndex]
      const yIndex = chart.axisIndex.y.axisIndex
      const yScale = axis.yScales[yIndex]
      const xKey = chart.dataKeys.x
      const yKey = chart.dataKeys.y
      const element = axis.canvas.select(selector).select('path')
      if (element.node() === null || this.isHidden(element)) {
        return
      }
      const style = window.getComputedStyle(element.node() as Element)
      const stroke = style.getPropertyValue('stroke')
      const datum = element.datum()
      if (datum === null || Array.isArray(datum) && datum.length === 0) {
        return
      }
      const yValue = yScale.invert(mouse[1])
      let idx = this.findIndex(datum, xKey, yKey, yValue)
      if (idx === undefined) {
        return
      }
      // find closest point
      let y0: number = yScale(datum[idx][yKey])
      if (idx - 1 >= 0) {
        const y1 = yScale(datum[idx - 1][yKey])
        const y2 = yScale(datum[idx][yKey])
        const [closestY, offset] = this.findClosestPoint(yPos, y1, y2)
        y0 = closestY
        idx = idx - 1 + offset
      }
      const xValue = datum[idx][xKey]
      const posx = xScale(xValue)
      // labels
      const xExtent = this.axes.chartsExtent('x', xIndex, {})
      const xLabel = this.determineLabel(xExtent, xValue)
      // outside range
      if (posx > xScale.range()[1] || posx < xScale.range()[0]) {
        pointData[d] = { x0: -window.innerWidth, y0, y: yScale.invert(y0), color: stroke }
      } else {
        pointData[d] = { x0: posx, y0, y: yScale.invert(y0), x: xLabel, color: stroke }
      }
    })

    this.updatePoints(pointData)

    if (Object.keys(pointData).length === 0) {
      yPos = mouse[1]
    }
    // update line
    this.updateYLine(yPos)
    this.updateYValue(yPos)
    this.updateTooltip(pointData, mouse)
  }

  findClosestPoint(y, y1, y2) {
    if ((y - y1) < (y2 - y)) {
      return [y2, 1]
    } else {
      return [y1, 0]
    }
  }

  findIndex(datum, xKey, yKey, yValue) {
    const bisect = d3.bisector((data) => {
      return data[yKey]
    }).left

    let xIsNull = (d) => isNull(d[xKey])
    if (Array.isArray(datum[0][xKey])) {
      xIsNull = (d) => {
        return isNull(d[xKey][0])
      }
    }
    const idx = bisect(datum, yValue)
    // before first point
    if (idx === 0 && datum[idx][yKey] > yValue) {
      return
    }
    // after last point
    if (idx === datum.length - 1 && datum[idx][yKey] < yValue) {
      return
    }
    if (!datum[idx] || xIsNull(datum[idx])) {
      return
    }
    return idx
  }

  determineLabel(xExtent: any[], xValue: any[] | any) {
    const s = d3.formatSpecifier("f")
    s.precision = d3.precisionFixed((xExtent[1] - xExtent[0]) / 100)
    let xLabel
    if (Array.isArray(xValue)) {
      const labels: string[] = []
      for (let j = 0; j < xValue.length; j++) {
        labels[j] = d3.format(s.toString())(xValue[j])
      }
      xLabel = labels.join('–')
    } else {
      xLabel = d3.format(s.toString())(xValue)
    }
    return xLabel
  }

  updatePoints(pointData) {
    const keys = Object.keys(pointData)
    this.mousePerLine
      .attr('transform', (id, i) => {
        if (keys.includes(id)) {
          return `translate(${pointData[id].x0} , ${pointData[id].y0})`
        } else {
          return `translate(0, ${-window.innerWidth})`
        }
      })
      .style('opacity', (id, i) => {
        if (keys.includes(id) && pointData[id].x0 !== undefined && pointData[id].y0 !== undefined) {
          return '1'
        }
        return '0'
      })
  }

  updateYLine(yPos: number) {
    this.group.select('.mouse-line').attr('transform', 'translate(' + 0 + ',' + yPos + ')')
  }

  updateYValue(yPos) {
    const axes = this.axes
    this.group
      .select('.mouse-y')
      .attr('transform', 'translate(' + 2 + ',' + (yPos - 2) + ')')
      .select('text')
      .text(this.yText(axes, yPos))
  }

  private yText(axes: CartesianAxes, yPos: any): string {
    let text = ''
    switch (axes.options.y[0].type) {
      case AxisType.time:
        text = dateFormatter(axes.yScales[0].invert(yPos), 'yyyy-MM-dd HH:mm ZZZZ', { timeZone: axes.options.y[0].timeZone, locale: axes.options.y[0].locale });
        break
      default:
        const s = d3.formatSpecifier("f")
        s.precision = d3.precisionFixed(axes.yScales[0].domain()[1] / 100)
        text = d3.format(s.toString())(axes.yScales[0].invert(yPos))
        break
    }
    return text
  }

  updateTooltip(pointData, mouse) {
    const axes = this.axes
    if (Object.keys(pointData).length === 0) {
      axes.tooltip.hide()
    } else {
      const htmlContent = document.createElement('div')
      for (const label in pointData) {
        const v = pointData[label]
        if (v.x !== undefined) {
          const spanElement = document.createElement('span')
          spanElement.style.color = v.color
          spanElement.innerText = v.x
          htmlContent.appendChild(spanElement)
          htmlContent.appendChild(document.createElement('br'))
        }
      }
      axes.tooltip.update(htmlContent, TooltipPosition.Right, mouse[0] + axes.margin.left, mouse[1] + axes.margin.top)
      if (axes.tooltip.isHidden) { axes.tooltip.show() }
    }
  }

  updateLineIndicators(): void {
    const traces = (this.trace !== undefined)
      ? this.trace
      : this.axes.charts.map((chart) => { return chart.id })

    const mousePerLine = this.group
      .selectAll<SVGGElement, string>('.mouse-per-line')
      .data(traces)

    const enter = mousePerLine
      .enter()
      .append('g')
      .attr('class', 'mouse-per-line')
      .attr('data-mouse-id', d => d)

     enter
      .append('circle')
      .attr('r', 3)
      .style('fill', 'white')
      .style('opacity', '0')
      .style('stroke-width', '1px')

    mousePerLine
      .exit()
      .remove()

    this.mousePerLine = enter.merge(mousePerLine)
  }

  redraw(): void {
    this.updateLineIndicators()
    this.group.select('.mouse-line').attr('d', () => {
      let d = 'M' + this.axes.width + ',' + 0
      d += ' ' + 0 + ',' + 0
      return d
    })
  }
}
