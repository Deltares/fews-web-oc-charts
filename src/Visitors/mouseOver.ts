import * as d3 from 'd3'
import { Axis, CartesianAxis, TooltipPosition } from '../Axis'
import { Visitor } from './visitor'
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

  visit(axis: Axis) {
    this.axis = axis as CartesianAxis
    this.create(axis as CartesianAxis)
  }

  create(axis: CartesianAxis) {
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

    let that = this
    this.mouseGroup
      .on('mouseout', function() {
        // on mouse out hide line, circles and text
        that.group.select('.mouse-line').style('opacity', '0')
        that.group.selectAll('.mouse-per-line circle').style('opacity', '0')
        that.group.selectAll('.mouse-x text').style('fill-opacity', '0')
        axis.hideTooltip(null)
      })
      .on('mouseover', function() {
        // on mouse in show line, circles and text
        that.group.select('.mouse-line').style('opacity', '1')
        that.group
          .selectAll('.mouse-per-line circle')
          .style('opacity', '1')
          .style('fill', function(d: any, i) {
            const selector = `[data-id="${d}"]`
            let element = that.axis.chartGroup.select(selector).select('path')
            if (element.node() === null ) return
            let stroke = window
              .getComputedStyle(element.node() as Element)
              .getPropertyValue('stroke')
            return stroke
          })
        that.group.select('.mouse-x text').style('fill-opacity', '1')
        axis.tooltip
          .transition()
          .duration(50)
          .style('opacity', 0.9)
      })
      .on('mousemove', function() {
        // mouse moving over canvas
        let mouse = d3.mouse(this)
        let popupData = {}
        let posx = mouse[0]
        let allHidden = true
        axis.canvas.selectAll('.mouse-per-line').attr('transform', function(d, i) {
          // let element = d3.select(d).select('path')
          const selector = `[data-id="${d}"]`
          let chart = axis.charts.find(chart => chart.id === d)
          let xIndex = chart.axisIndex.x.axisIndex
          let xScale = axis.xScale[xIndex]
          let yIndex = chart.axisIndex.y.axisIndex
          let yScale = axis.yScale[yIndex]
          let xKey = chart.dataKeys.x
          let yKey = chart.dataKeys.y
          let bisect = d3.bisector(function(d: any) {
            return d[xKey]
          }).right

          let element = axis.canvas.select(selector).select('path')
          if (element.node() === null) return 'translate(0,' + -window.innerHeight + ')'
          let style = window.getComputedStyle(element.node() as Element)
          if (style === null || style.getPropertyValue('visibility') === 'hidden') {
            return 'translate(0,' + -window.innerHeight + ')'
          }
          allHidden = false
          let stroke = style.getPropertyValue('stroke')
          let datum = element.datum() as any
          if (datum === null || datum.length === 0) {
            return 'translate(0,' + -window.innerHeight + ')'
          }
          let mouseValue = xScale.invert(mouse[0])
          let idx = bisect(datum, mouseValue)
          if (idx === 0 && datum[idx][xKey] >= mouseValue) {
            return 'translate(0,' + -window.innerHeight + ')'
          }
          if (!datum[idx] || datum[idx][yKey] === null) {
            return 'translate(0,' + -window.innerHeight + ')'
          }
          let valy = datum[idx][yKey]
          let posy = yScale(valy)
          posx = xScale(datum[idx][xKey])
          let yLabel
          if (Array.isArray(posy)) {
            let labels = posy
            for (let i = 0; i < posy.length; i++) {
              labels[i] = yScale.invert(posy[i]).toFixed(2)
            }
            yLabel = labels.join(':')
            posy = posy[0]
          } else {
            yLabel = valy.toFixed(2)
          }
          posy =
            posy < yScale.range()[1] || posy > yScale.range()[0]
              ? -window.innerHeight
              : posy
          popupData[d] = { x: xScale.invert(datum[idx][xKey]), y: yLabel, color: stroke }
          return 'translate(' + posx + ',' + posy + ')'
        })

        // update line
        that.group.select('.mouse-line').attr('transform', 'translate(' + mouse[0] + ',' + 0 + ')')

        // update x-value
        that.group
          .select('.mouse-x')
          .attr('transform', 'translate(' + (mouse[0] + 2) + ',' + (axis.height - 5) + ')')
          .select('text')
          .text(dateFormatter(axis.xScale[0].invert(mouse[0]), 'YYYY-MM-DD HH:mm z',{timeZone: that.axis.timeZone} ) )
        if (allHidden) {
          axis.hideTooltip(null)
          return
        }
        let htmlContent = ''
        for (let label in popupData) {
          let v = popupData[label]
          htmlContent += '<span style="color:' + v.color + ' ">' + '   ' + v.y + '</span><br/>'
        }

        let div = axis.showTooltip(htmlContent, TooltipPosition.Right, d3.event.pageX, d3.event.pageY)
      })
  }

  updateLineIndicators () {
    let traces = (this.trace !== undefined)
    ? this.trace
    : this.axis.charts.map( (chart) => {return chart.id})

    let mousePerLine = this.group
      .selectAll('.mouse-per-line')
      .data(traces)

    mousePerLine
      .enter()
      .append('g')
      .attr('class', 'mouse-per-line')
      .attr('data-id', d => d)
      .append('circle')
      .attr('r', 3)
      .style('fill', 'white')
      .style('stroke-width', '1px')
      .style('opacity', '0')

    mousePerLine
      .exit()
      .remove()
  }

  redraw() {
    this.updateLineIndicators()
    // FIXME: should resize mouse-events group (is now done by zoomHandler)
    // this.mouseGroup
    //   .select('rect')
    //   .attr('height', this.axis.height)
    //   .attr('width', this.axis.width)

    let that = this
    this.group.select('.mouse-line').attr('d', function() {
      let d = 'M' + 0 + ',' + that.axis.height
      d += ' ' + 0 + ',' + 0
      return d
    })
  }
}
