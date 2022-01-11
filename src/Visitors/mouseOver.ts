import * as d3 from 'd3'
import { Axis, CartesianAxis } from '../Axis'
import { Visitor } from './visitor'
import { TooltipPosition } from '../Tooltip'
import { dateFormatter } from '../Utils'

export class MouseOver implements Visitor {
  private trace: string[]
  private group: d3.Selection<SVGElement, unknown, SVGElement, unknown>
  private axis: CartesianAxis
  private mouseGroup: d3.Selection<SVGElement, unknown, SVGElement, unknown>

  constructor(trace?: string[]) {
    this.trace = trace
  }

  visit(axis: Axis): void {
    this.axis = axis as CartesianAxis
    this.create(axis as CartesianAxis)
  }

  create(axis: CartesianAxis): void {
    this.mouseGroup = axis.canvas.select('.mouse-events')
    this.group = axis.canvas.insert('g', '.mouse-events')
      .attr('class', 'mouse-over')
      .attr('font-family', 'sans-serif')
      .attr('font-size', 10)

    this.group
      .append('path')
      .attr('class', 'mouse-line')
      .style('opacity', '0')
      .attr('d', function() {
        let d = 'M' + 0 + ',' + axis.height
        d += ' ' + 0 + ',' + 0
        return d
      })

    this.group
      .append('g')
      .attr('class', 'mouse-x')
      .attr('transform', 'translate(' + 0 + ',' + axis.height + ')')
      .append('text')
      .text('')

    this.updateLineIndicators()

    this.mouseGroup
      .on('pointerout', () => this.onPointerout())
      .on('pointerover',() => this.onPointerover())
      .on('pointermove', (event) => {
        // mouse moving over canvas
        const mouse = d3.pointer(event)
        // determine closest point over all lines
        const xPos = this.xPosForCharts(mouse)
        this.update(mouse, xPos)
      })
  }

  // pointer event handlers
  onPointerout (): void {
    // on mouse out hide line, circles and text
    this.group.select('.mouse-line').style('opacity', '0')
    this.group.selectAll('.mouse-per-line circle').style('opacity', '0')
    this.group.selectAll('.mouse-x text').style('fill-opacity', '0')
    this.axis.tooltip.hide()
  }


  onPointerover (): void {
    // on mouse in show line, circles and text
    this.axis.tooltip.show()
    this.group.select('.mouse-line').style('opacity', '1')
    this.group
      .selectAll('.mouse-per-line circle')
      .style('opacity', '1')
      .style('fill', (d: string) => {
        const selector = `[data-chart-id="${d}"]`
        const element = this.axis.chartGroup.select(selector).select('path')
        if (element.node() === null ) return
        return window
          .getComputedStyle(element.node() as Element)
          .getPropertyValue('stroke')
      })
    this.group.select('.mouse-x text').style('fill-opacity', '1')
  }

  xPosForCharts(mouse) {
    const axis = this.axis
    let rMin = Infinity
    let xPos = mouse[0]
    axis.canvas.selectAll('.mouse-per-line').each((d, i) => {
      const selector = `[data-chart-id="${d}"]`
      const element = axis.canvas.select(selector).select('path')
      if (element.node() !== null) {
        if (this.isHidden(element)) {
          //skip
        } else {
          const datum = element.datum();
          [ xPos, rMin ] = this.closestPointForChart(d, datum, mouse[0], xPos, rMin)
        }
      }
    })
    return xPos
  }

  isHidden(element) {
    const style = window.getComputedStyle(element.node() as Element)
    return style === null || style.getPropertyValue('visibility') === 'hidden'
  }

  distanceSquared(x0, x1) {
    return (x0 - x1) ** 2
  }

  closestPointForChart(id: string, datum: any[], x: number, xPos: number, rMin: number) {
    const axis = this.axis
    const chart = axis.charts.find(c => c.id === id)
    const xIndex = chart.axisIndex.x.axisIndex
    const xScale = axis.xScale[xIndex]
    const mouseValue = xScale.invert(x)
    const xKey = chart.dataKeys.x
    const yKey = chart.dataKeys.y
    const bisect = d3.bisector((data) => {
      return data[xKey]
    }).right
    const idx = bisect(datum, mouseValue)
    if ( idx -1 >= 0 && datum[idx-1][yKey] !== null) {
      const x0 = xScale(datum[idx-1][xKey])
      const r0 = this.distanceSquared(x0, x)
      if (r0 < rMin) {
        rMin = r0
        xPos = x0
      }
    }
    if ( idx < datum.length && datum[idx][yKey] !== null) {
      const x1 = xScale(datum[idx][xKey])
      const r1 = this.distanceSquared(x1, x)
      if (r1 < rMin) {
        rMin = r1
        xPos = x1
      }
    }
    return [xPos, rMin]
  }

  update(mouse, xPos) {
    const axis = this.axis
    const pointData = {}

    axis.canvas.selectAll('.mouse-per-line').each((d, i) => {
      const selector = `[data-chart-id="${d}"]`
      const chart = axis.charts.find(c => c.id === d)
      const xIndex = chart.axisIndex.x.axisIndex
      const xScale = axis.xScale[xIndex]
      const yIndex = chart.axisIndex.y.axisIndex
      const yScale = axis.yScale[yIndex]
      const xKey = chart.dataKeys.x
      const yKey = chart.dataKeys.y
      const element = axis.canvas.select(selector).select('path')
      if (element.node() === null || this.isHidden(element)) {
        return
      }
      const style = window.getComputedStyle(element.node() as Element)
      const stroke = style.getPropertyValue('stroke')
      const datum = element.datum()
      if (datum === null || datum.length === 0) {
        return
      }
      const xValue = xScale.invert(xPos)
      let idx = this.findIndex(datum, xKey, yKey, xValue, mouse, xPos)
      if ( idx === undefined) {
        return
      }
      // find closest point
      let x0
      const x1 = xScale(datum[idx-1][xKey])
      const x2 = xScale(datum[idx][xKey])
      if ((xPos - x1) > (x2 - xPos)) {
        x0 = x2
      } else {
        x0 = x1
        idx = idx -1
      }

      const valy = datum[idx][yKey]
      const posy = yScale(valy)

      // labels
      const yLabel = this.determineLabel(posy, valy, yScale)
      // outside range
      if ( posy < yScale.range()[1] || posy > yScale.range()[0] ) {
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

  findIndex(datum, xKey, yKey, xValue, mouse, xPos) {
    const bisect = d3.bisector((data) => {
      return data[xKey]
    }).left
    const idx = bisect(datum, xValue)
    // before first point
    if (idx === 0 && datum[idx][xKey] >= xValue) {
      return
    }
    // after last point
    if (idx === datum.length-1 && mouse[0] > xPos) {
      return
    }
    if (!datum[idx] || datum[idx][yKey] === null || datum[idx-1][yKey] === null) {
      return
    }
    return idx
  }

  determineLabel(posy: number[] | number , valy, yScale) {
    const yExtent = this.axis.extent.y
    const s = d3.formatSpecifier("f")
    s.precision = d3.precisionFixed((yExtent[1] - yExtent[0]) / 100 )
    let yLabel
    if (Array.isArray(posy)) {
      const labels: string[] = []
      for (let j = 0; j < posy.length; j++) {
        labels[j] = d3.format(s.toString())(yScale.invert(posy[j]))
      }
      yLabel = labels.join(':')
    } else {
      yLabel = d3.format(s.toString())(valy)
    }
    return yLabel
  }

  updatePoints(pointData) {
    const axis = this.axis
    axis.canvas.selectAll('.mouse-per-line').attr('transform', (id, i) => {
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
    const axis = this.axis
    this.group
      .select('.mouse-x')
      .attr('transform', 'translate(' + ( xPos + 2) + ',' + (axis.height - 5) + ')')
      .select('text')
      .text(dateFormatter(axis.xScale[0].invert(xPos), 'yyyy-MM-dd HH:mm ZZZZ', { timeZone: axis.options.x[0].timeZone, locale: axis.options.x[0].locale } ) )
  }

  updateTooltip(pointData, mouse) {
    const axis = this.axis
    if (Object.keys(pointData).length === 0) {
      axis.tooltip.hide()
    } else {
      let htmlContent = ''
      for (const label in pointData) {
        const v = pointData[label]
        if (v.y !== undefined) {
          htmlContent += `<span style="color: ${v.color}"> ${v.y} </span><br/>`
        }
      }
      axis.tooltip.update(htmlContent, TooltipPosition.Right, mouse[0] + axis.margin.left, mouse[1] + axis.margin.top)
    }
  }

  updateLineIndicators (): void {
    const traces = (this.trace !== undefined)
    ? this.trace
    : this.axis.charts.map( (chart) => {return chart.id})

    const mousePerLine = this.group
      .selectAll('.mouse-per-line')
      .data(traces)

    mousePerLine
      .enter()
      .append('g')
      .attr('class', 'mouse-per-line')
      .attr('data-mouse-id', d => d)
      .append('circle')
      .attr('r', 3)
      .style('fill', 'white')
      .style('stroke-width', '1px')
      .style('opacity', '0')

    mousePerLine
      .exit()
      .remove()
  }

  redraw(): void {
    this.updateLineIndicators()
    this.group.select('.mouse-line').attr('d', () => {
      let d = 'M' + 0 + ',' + this.axis.height
      d += ' ' + 0 + ',' + 0
      return d
    })
  }
}
