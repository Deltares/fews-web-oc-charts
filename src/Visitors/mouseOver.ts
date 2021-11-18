import * as d3 from 'd3'
import { Axis, CartesianAxis } from '../Axis'
import { Visitor } from './visitor'
import { TooltipPosition } from '../Tooltip'
import { dateFormatter } from '../Utils'

export class MouseOver implements Visitor {
  private trace: string[]
  private group: any
  private axis: CartesianAxis
  private mouseGroup: any

  // TODO: we should assign the level select to an axis and give an option where to put the labels (left, right)
  constructor(trace?: string[]) {
    this.trace = trace
  }

  visit(axis: Axis): void {
    this.axis = axis as CartesianAxis
    this.create(axis as CartesianAxis)
  }

  create(axis: CartesianAxis): void {
    this.mouseGroup = axis.canvas.select('.mouse-events')
    if (this.mouseGroup.size() === 0) {
      this.mouseGroup = axis.canvas
        .append('g')
        .attr('class', 'mouse-events')
        .append('rect')
        .attr('width', axis.width)
        .attr('height', axis.height)
        .attr('fill', 'none')
        .attr('pointer-events', 'all')
    }
    this.group = axis.canvas.insert('g', '.mouse-events').attr('class', 'mouse-over')

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
        const popupData = {}
        let allHidden = true
        let rMin = Infinity
        let xPos = -window.innerWidth
        // determine closest point over all lines
        axis.canvas.selectAll('.mouse-per-line').each(function(d, i) {
          // let element = d3.select(d).select('path')
          const selector = `[data-chart-id="${d}"]`
          const element = axis.canvas.select(selector).select('path')
          if (element.node() !== null) {
            const style = window.getComputedStyle(element.node() as Element)
            if (style === null || style.getPropertyValue('visibility') === 'hidden') {
              //skip
            } else {
              const chart = axis.charts.find(chart => chart.id === d)
              const xIndex = chart.axisIndex.x.axisIndex
              const xScale = axis.xScale[xIndex]
              const mouseValue = xScale.invert(mouse[0])
              const xKey = chart.dataKeys.x
              const yKey = chart.dataKeys.y
              const bisect = d3.bisector(function(d) {
                return d[xKey]
              }).right
              const datum = element.datum()
              const idx = bisect(datum, mouseValue)
              if ( idx -1 >= 0 && datum[idx-1][yKey] !== null) {
                const x0 = xScale(datum[idx-1][xKey])
                const r0 = (x0 - mouse[0] ) ** 2
                if ( r0 < rMin) {
                  rMin = r0
                  xPos = xScale(datum[idx-1][xKey])
                }
              }
              if ( idx < datum.length && datum[idx][yKey] !== null) {
                const x1 = xScale(datum[idx][xKey])
                const r1 = ( x1 - mouse[0]) ** 2
                if ( r1 < rMin) {
                  rMin = r1
                  xPos = xScale(datum[idx][xKey])
                }
              }
            }
          }
        })

        const yExtent = this.axis.extent.y
        const s = d3.formatSpecifier("f")
        s.precision = d3.precisionFixed((yExtent[1] - yExtent[0]) / 100 )

        axis.canvas.selectAll('.mouse-per-line').attr('transform', (d) => {
          // let element = d3.select(d).select('path')
          const selector = `[data-chart-id="${d}"]`
          const chart = axis.charts.find(chart => chart.id === d)
          const xIndex = chart.axisIndex.x.axisIndex
          const xScale = axis.xScale[xIndex]
          const yIndex = chart.axisIndex.y.axisIndex
          const yScale = axis.yScale[yIndex]
          const xKey = chart.dataKeys.x
          const yKey = chart.dataKeys.y
          const bisect = d3.bisector(function(d) {
            return d[xKey]
          }).left

          const element = axis.canvas.select(selector).select('path')
          if (element.node() === null) return 'translate(0,' + -window.innerHeight + ')'
          const style = window.getComputedStyle(element.node() as Element)
          if (style === null || style.getPropertyValue('visibility') === 'hidden') {
            return 'translate(0,' + -window.innerHeight + ')'
          }
          allHidden = false
          const stroke = style.getPropertyValue('stroke')
          const datum = element.datum()
          if (datum === null || datum.length === 0) {
            return 'translate(0,' + -window.innerHeight + ')'
          }
          const xValue = xScale.invert(xPos)
          let idx = bisect(datum, xValue)
          // before first point
          if (idx === 0 && datum[idx][xKey] >= xValue) {
            return 'translate(0,' + -window.innerHeight + ')'
          }
          // after last first point
          if (idx === datum.length-1 && xValue >= datum[idx][xKey]) {
            return 'translate(0,' + -window.innerHeight + ')'
          }
          if (!datum[idx] || datum[idx][yKey] === null || datum[idx-1][yKey] === null) {
            return 'translate(0,' + -window.innerHeight + ')'
          }

          // find closest point
          let x0 = xPos
          const x1 = xScale(datum[idx-1][xKey])
          const x2 = xScale(datum[idx][xKey])
          if ((xPos - x1) > (x2 - xPos)) {
            x0 = x2
          } else {
            x0 = x1
            idx = idx -1
          }

          const valy = datum[idx][yKey]
          let posy = yScale(valy)

          // labels
          let yLabel
          if (Array.isArray(posy)) {
            const labels = posy
            for (let i = 0; i < posy.length; i++) {
              labels[i] = d3.format(s.toString())(yScale.invert(posy[i]))
            }
            yLabel = labels.join(':')
            posy = posy[0]
          } else {
            yLabel = d3.format(s.toString())(valy)
          }
          // outside range
          posy =
            posy < yScale.range()[1] || posy > yScale.range()[0]
              ? -window.innerHeight
              : posy
          popupData[d] = { x: xScale.invert(x0), y: yLabel, color: stroke }
          return 'translate(' + x0 + ',' + posy + ')'
        })

        // if no data present for any chart show mouse postion
        if (Object.keys(popupData).length === 0) xPos = mouse[0]

        // update line
        this.group.select('.mouse-line').attr('transform', 'translate(' + xPos + ',' + 0 + ')')

        // update x-value
        this.group
          .select('.mouse-x')
          .attr('transform', 'translate(' + ( xPos + 2) + ',' + (axis.height - 5) + ')')
          .select('text')
          .text(dateFormatter(axis.xScale[0].invert(xPos), 'yyyy-MM-dd HH:mm ZZZZ', { timeZone: this.axis.timeZone } ) )
        if (allHidden) {
          axis.tooltip.hide()
          return
        }
        let htmlContent = ''
        for (const label in popupData) {
          const v = popupData[label]
          htmlContent += `<span style="color: ${v.color}"> ${v.y} </span><br/>`
        }
        axis.tooltip.update(htmlContent, TooltipPosition.Right, mouse[0] + axis.margin.left, mouse[1] + axis.margin.top)
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
        const stroke = window
          .getComputedStyle(element.node() as Element)
          .getPropertyValue('stroke')
        return stroke
      })
    this.group.select('.mouse-x text').style('fill-opacity', '1')
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
    // FIXME: should resize mouse-events group (is now done by zoomHandler)
    // this.mouseGroup
    //   .select('rect')
    //   .attr('height', this.axis.height)
    //   .attr('width', this.axis.width)

    this.group.select('.mouse-line').attr('d', () => {
      let d = 'M' + 0 + ',' + this.axis.height
      d += ' ' + 0 + ',' + 0
      return d
    })
  }
}
