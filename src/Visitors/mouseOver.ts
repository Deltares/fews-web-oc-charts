import * as d3 from 'd3'
import { Axes } from '../Axes/axes.js'
import { CartesianAxes } from '../index.js';
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
    this.group = axes.canvas.insert('g', '.mouse')
      .attr('class', 'mouse-over')
      .attr('font-family', 'sans-serif')
      .attr('fill', 'currentColor')

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

    this.updateLineIndicators()

    this.mouseGroup
      .on('pointerout', () => this.onPointerout())
      .on('pointerover', () => this.onPointerover())
      .on('pointermove', (event) => {
        // mouse moving over canvas
        const mouse = d3.pointer(event)
        // determine closest point over all lines
        const xPos = this.xPosForCharts(mouse)
        this.update(mouse, xPos)
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

  update(mouse, xPos) {
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
      const xValue = xScale.invert(mouse[0])
      let idx = this.findIndex(datum, xKey, yKey, xValue)
      if (idx === undefined) {
        return
      }
      // find closest point
      let x0: number = xScale(datum[idx][xKey])
      if (idx - 1 >= 0) {
        const x1 = xScale(datum[idx - 1][xKey])
        const x2 = xScale(datum[idx][xKey])
        const [closestX, offset] = this.findClosestPoint(xPos, x1, x2)
        x0 = closestX
        idx = idx - 1 + offset
      }
      const valy = datum[idx][yKey]
      const posy = yScale(valy)
      // labels
      const yExtent = this.axes.chartsExtent('y', yIndex, {})
      const yLabel = this.determineLabel(posy, yExtent, valy, yScale)
      // outside range
      if (posy < yScale.range()[1] || posy > yScale.range()[0]) {
        pointData[d] = { x0, y0: -window.innerHeight, x: xScale.invert(x0), color: stroke }
      } else {
        pointData[d] = { x0, y0: posy, x: xScale.invert(x0), y: yLabel, color: stroke }
      }
    })

    this.updatePoints(pointData)

    if (Object.keys(pointData).length === 0) {
      xPos = mouse[0]
    }
    // update line
    this.updateXLine(xPos)
    this.updateXValue(xPos)
    this.updateTooltip(pointData, mouse)
  }

  findClosestPoint(x, x1, x2) {
    if ((x - x1) > (x2 - x)) {
      return [x2, 1]
    } else {
      return [x1, 0]
    }
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

  determineLabel(posy: number[] | number, yExtent, valy, yScale) {
    const s = d3.formatSpecifier("f")
    s.precision = d3.precisionFixed((yExtent[1] - yExtent[0]) / 100)
    let yLabel
    if (Array.isArray(posy)) {
      const labels: string[] = []
      for (let j = 0; j < posy.length; j++) {
        labels[j] = d3.format(s.toString())(yScale.invert(posy[j]))
      }
      yLabel = labels.join(':')
    } else if (Array.isArray(valy)) {
      yLabel = `${d3.format(s.toString())(valy[0])} &ndash; ${d3.format(s.toString())(valy[1])}`
    } else {
      yLabel = d3.format(s.toString())(valy)
    }
    return yLabel
  }

  updatePoints(pointData) {
    const axes = this.axes
   this.mousePerLine.attr('transform', (id, i) => {
      const keys = Object.keys(pointData)
      if (keys.includes(id)) {
        return `translate(${pointData[id].x0} , ${pointData[id].y0})`
      } else {
        return `translate(0, ${-window.innerWidth})`
      }
    })
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
      .text(dateFormatter(axes.xScales[0].invert(xPos), 'yyyy-MM-dd HH:mm ZZZZ', { timeZone: axes.options.x[0].timeZone, locale: axes.options.x[0].locale }))
  }

  updateTooltip(pointData, mouse) {
    const axes = this.axes
    if (Object.keys(pointData).length === 0) {
      axes.tooltip.hide()
    } else {
      let htmlContent = ''
      for (const label in pointData) {
        const v = pointData[label]
        if (v.y !== undefined) {
          htmlContent += `<span style="color: ${v.color}"> ${v.y} </span><br/>`
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
      .style('stroke-width', '1px')

    mousePerLine
      .exit()
      .remove()

    this.mousePerLine = enter.merge(mousePerLine)
  }

  redraw(): void {
    this.updateLineIndicators()
    this.group.select('.mouse-line').attr('d', () => {
      let d = 'M' + 0 + ',' + this.axes.height
      d += ' ' + 0 + ',' + 0
      return d
    })
  }
}
