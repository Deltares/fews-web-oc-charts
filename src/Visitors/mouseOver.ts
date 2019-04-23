import * as d3 from 'd3'
import { Axis, CartesianAxis } from '../Axis'
import * as WB from '../Utils'
import { Visitor } from './visitor'

export class MouseOver implements Visitor {
  private trace: string[]
  private group: any
  private axis: CartesianAxis

  constructor(trace: string[]) {
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

    let mousePerLine = this.group
      .selectAll('.mouse-per-line')
      .data(this.trace)
      .enter()
      .append('g')
      .attr('class', 'mouse-per-line')

    mousePerLine
      .append('circle')
      .attr('r', 3)
      // .style("stroke", 'white')
      .style('fill', 'white')
      .style('stroke-width', '1px')
      .style('opacity', '0')

    let that = this
    mouseG
      .on('mouseout', function() {
        // on mouse out hide line, circles and text
        that.group.select('.mouse-line').style('opacity', '0')
        that.group.selectAll('.mouse-per-line circle').style('opacity', '0')
        that.group.select('.mouse-x text').style('opacity', '0')
        axis.hideTooltip(null)
      })
      .on('mouseover', function() {
        // on mouse in show line, circles and text
        that.group.select('.mouse-line').style('opacity', '1')
        that.group
          .selectAll('.mouse-per-line circle')
          .style('opacity', '1')
          .style('fill', function(d: any, i) {
            let element = d3.select(d).select('path')
            let stroke = window
              .getComputedStyle(element.node() as Element)
              .getPropertyValue('stroke')
            return stroke
          })
        that.group.select('.mouse-x text').style('opacity', '1')
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
          let element = axis.canvas.select(d).select('path')
          let style = window.getComputedStyle(element.node() as Element)
          if (style === null || style.getPropertyValue('visibility') === 'hidden')
            return 'translateY(' + -window.innerHeight + ')'
          allHidden = false
          let stroke = style.getPropertyValue('stroke')
          let datum = element.datum() as any
          let mouseValue = axis.xScale.invert(mouse[0])
          let idx = bisect(datum, mouseValue)
          if (idx == 0 && datum[idx].x >= mouseValue) {
            return 'translateY(' + -window.innerHeight + ')'
          }
          if (!datum[idx] || datum[idx].y === null) {
            return 'translateY(' + -window.innerHeight + ')'
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
          popupData[d] = { x: axis.xScale.invert(datum[idx].x), y: yLabel, color: stroke }
          return 'translate(' + posx + ',' + posy + ')'
        })

        // update line
        that.group.select('.mouse-line').attr('transform', 'translate(' + posx + ',' + 0 + ')')

        // update x-value
        let timezone = 'Etc/GMT' + that.axis.timeZoneOffset / 60
        let options = {
          weekday: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          timeZone: timezone,
          timeZoneOffset: that.axis.timeZoneOffset
        }
        let dateFormatter = WB.dateFormatter('nl-NL', options)
        that.group
          .select('.mouse-x')
          .attr('transform', 'translate(' + (posx + 2) + ',' + (axis.height - 5) + ')')
          .select('text')
          .text(dateFormatter(axis.xScale.invert(posx)))
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

  redraw() {
    let that = this
    this.group.select('.mouse-line').attr('d', function() {
      let d = 'M' + 0 + ',' + that.axis.height
      d += ' ' + 0 + ',' + 0
      return d
    })
  }
}
