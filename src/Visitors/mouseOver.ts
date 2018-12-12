import * as d3 from 'd3'
import { Axis, CartesianAxis } from '../Axis'
import { Visitor } from './visitor'

export class MouseOver implements Visitor {
  private trace: string[]

  constructor(trace: string[]) {
    this.trace = trace
    console.log('MouseOver')
  }

  visit(axis: Axis) {
    this.create(axis as CartesianAxis)
  }

  create(axis: CartesianAxis) {
    let mouseG = axis.canvas.append('g').attr('class', 'mouse-over-effects')

    mouseG
      .append('path') // this is the black vertical line to follow mouse
      .attr('class', 'mouse-line')
      .style('opacity', '0')
    mouseG
      .append('g')
      .attr('class', 'mouse-x')
      .attr('transform', 'translate(' + 0 + ',' + axis.height + ')')
      .append('text')
      .text('')

    let mousePerLine = mouseG
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

    mouseG
      .append('svg:rect') // append a rect to catch mouse movements on canvas
      .attr('width', axis.width) // can't catch mouse events on a g element
      .attr('height', axis.height)
      .attr('fill', 'none')
      .attr('pointer-events', 'all')
      .on('mouseout', function() {
        // on mouse out hide line, circles and text
        d3.select('.mouse-line').style('opacity', '0')
        d3.selectAll('.mouse-per-line circle').style('opacity', '0')
        d3.selectAll('.mouse-x text').style('opacity', '0')
        axis.hideTooltip(null)
      })
      .on('mouseover', function() {
        // on mouse in show line, circles and text
        d3.select('.mouse-line').style('opacity', '1')
        d3.selectAll('.mouse-per-line circle')
          .style('opacity', '1')
          .style('fill', function(d: any, i) {
            let element = d3.select(d).select('path')
            var stroke = window
              .getComputedStyle(element.node() as Element)
              .getPropertyValue('stroke')
            return stroke
          })
        d3.selectAll('.mouse-x text').style('opacity', '1')
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
          let element = d3.select(d).select('path')
          let style = window.getComputedStyle(element.node() as Element)
          if (style.getPropertyValue('visibility') === 'hidden') return
          allHidden = false
          let stroke = style.getPropertyValue('stroke')
          let datum = element.datum() as any
          let idx = bisect(datum, mouse[0])
          let posy = datum[idx].y
          posx = datum[idx].x
          let yLabel
          if (Array.isArray(posy)) {
            let labels = posy
            for (let i = 0; i < posy.length; i++) {
              labels[i] = axis.yScale.invert(posy[i]).toFixed(2)
            }
            yLabel = labels.join(':')
            posy = posy[0]
          } else {
            yLabel = axis.yScale.invert(posy).toFixed(2)
          }
          popupData[d] = { x: axis.xScale.invert(datum[idx].x), y: yLabel, color: stroke }
          return 'translate(' + posx + ',' + posy + ')'
        })

        // update line
        d3.select('.mouse-line').attr('d', function() {
          var d = 'M' + posx + ',' + axis.height
          d += ' ' + posx + ',' + 0
          return d
        })

        // update x-value
        let xFormat = d3.timeFormat('%H:%M')
        d3.select('.mouse-x')
          .attr('transform', 'translate(' + (posx + 2) + ',' + (axis.height - 5) + ')')
          .select('text')
          .text(xFormat(axis.xScale.invert(posx)))

        if (allHidden) {
          axis.hideTooltip(null)
          return
        }
        var htmlContent = ''
        for (var label in popupData) {
          var v = popupData[label]
          htmlContent += '<span style="color:' + v.color + ' ">' + '   ' + v.y + '</span><br/>'
        }

        var div = axis.tooltip.html(htmlContent)
        var h = div.node().clientHeight / 2

        div.style('left', d3.event.pageX + 'px').style('top', d3.event.pageY - h + 'px')
      })
  }
}
