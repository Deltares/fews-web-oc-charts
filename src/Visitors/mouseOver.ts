import * as d3 from 'd3'
import { Axis, CartesianAxis } from '../Axis'
import { Visitor } from './visitor'
import { dateFormatter } from '../Utils'

export class MouseOver implements Visitor {
  private trace: string[]
  private group: any
  private axis: CartesianAxis

  constructor(trace?: string[]) {
    this.trace = trace
  }

  visit(axis: Axis) {
    this.axis = axis as CartesianAxis
    this.create(axis as CartesianAxis)
  }

  create(axis: CartesianAxis) {
    let mouseG = axis.canvas.select('.mouse-events')
    if (mouseG.size() === 0) {
      mouseG = axis.canvas
        .append('g')
        .attr('class', 'mouse-events')
        .append('svg:rect')
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
    mouseG
      .on('mouseout', function() {
        // on mouse out hide line, circles and text
        that.group.select('.mouse-line').style('opacity', '0')
        that.group.selectAll('.mouse-per-line circle').style('opacity', '0')
        that.group.select('.mouse-x text').style('fill-opacity', '0')
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
            let element = d3.select(selector).select('path')
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
        let bisect = d3.bisector(function(d: any) {
          return d.x
        }).right
        let popupData = {}
        let posx = mouse[0]
        let allHidden = true
        axis.canvas.selectAll('.mouse-per-line').attr('transform', function(d, i) {
          const selector = `[data-id="${d}"]`
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
          let mouseValue = axis.xScale.invert(mouse[0])
          let idx = bisect(datum, mouseValue)
          if (idx === 0 && datum[idx].x >= mouseValue) {
            return 'translate(0,' + -window.innerHeight + ')'
          }
          if (!datum[idx] || datum[idx].y === null) {
            return 'translate(0,' + -window.innerHeight + ')'
          }
          let valy = datum[idx].y
          let posy = axis.yScale(valy)
          posx = axis.xScale(datum[idx].x)
          let yLabel
          if (Array.isArray(posy)) {
            let labels = posy
            for (let i = 0; i < posy.length; i++) {
              labels[i] = axis.yScale.invert(posy[i]).toFixed(2)
            }
            yLabel = labels.join(':')
            posy = posy[0]
          } else {
            yLabel = valy.toFixed(2)
          }
          posy =
            posy < axis.yScale.range()[1] || posy > axis.yScale.range()[0]
              ? -window.innerHeight
              : posy
          popupData[d] = { x: axis.xScale.invert(datum[idx].x), y: yLabel, color: stroke }
          return 'translate(' + posx + ',' + posy + ')'
        })

        // update line
        that.group.select('.mouse-line').attr('transform', 'translate(' + mouse[0] + ',' + 0 + ')')

        // update x-value
        that.group
          .select('.mouse-x')
          .attr('transform', 'translate(' + (mouse[0] + 2) + ',' + (axis.height - 5) + ')')
          .select('text')
          .text(dateFormatter(axis.xScale.invert(mouse[0]), 'YYYY-MM-DD HH:mm z',{timeZone: that.axis.timeZone} ) )
        if (allHidden) {
          axis.hideTooltip(null)
          return
        }
        let htmlContent = ''
        for (let label in popupData) {
          let v = popupData[label]
          htmlContent += '<span style="color:' + v.color + ' ">' + '   ' + v.y + '</span><br/>'
        }

        let div = axis.tooltip.html(htmlContent)
        let h = div.node().clientHeight / 2

        div.style('left', d3.event.pageX + 'px').style('top', d3.event.pageY - h + 'px')
      })
  }

  updateLineIndicators () {
    let traces = (this.trace !== undefined)
    ? this.trace
    : this.axis.charts.map( (chart) => {return chart.id})

    console.log(traces)
    let mousePerLine = this.group
      .selectAll('.mouse-per-line')
      .data(traces)

    mousePerLine
      .enter()
      .append('g')
      .attr('class', 'mouse-per-line')
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
    let that = this
    this.group.select('.mouse-line').attr('d', function() {
      let d = 'M' + 0 + ',' + that.axis.height
      d += ' ' + 0 + ',' + 0
      return d
    })
  }
}
