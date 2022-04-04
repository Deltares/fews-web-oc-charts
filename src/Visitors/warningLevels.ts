import * as d3 from 'd3'
import { Axis, CartesianAxis } from '../Axis'
import { Visitor } from './visitor'

export interface WarningLevelOptions {
  y?: {
    axisIndex: number;
  };
}

export class WarningLevels implements Visitor {
  public escalationLevels: any[]
  private group: any
  private axis: CartesianAxis
  private scale: any
  private warningAxis: any
  private sections: any
  private transitionTime: number
  private options: any

  constructor(escalationLevels, options: WarningLevelOptions) {
    this.escalationLevels = escalationLevels
    this.transitionTime = 0
    this.options = {
      ...{
        y: { axisIndex: 0 }
      },
      ...options
    }
  }

  visit(axis: Axis): void {
    this.axis = axis as CartesianAxis
    this.create(axis as CartesianAxis)
  }

  create(axis: CartesianAxis): void {
    const scale = (this.scale = d3.scaleLinear())
    this.scale.domain(axis.yScale[this.options.y.axisIndex].domain()).range(axis.yScale[this.options.y.axisIndex].range())
    const escalationLevels = this.escalationLevels

    const tickValues = escalationLevels
      .filter(el => {
        const domain = scale.domain()
        return el.val >= domain[0] && el.val <= domain[1]
      })
      .map(el => {
        return el.val
      })

    this.warningAxis = d3
      .axisRight(this.scale)
      .tickValues(tickValues)
      .tickFormat((d, i) => {
        const level = escalationLevels.find( (l) => l.val === d)
        return level.id
      })

    this.group = axis.canvas
      .append('g')
      .attr('class', 'axis y2-axis')
      .attr('transform', 'translate(' + axis.width + ' ,0)')

    const axisHandle = axis.canvas.select('.y2-axis').call(this.warningAxis)
    axisHandle
      .selectAll('.tick text')
      .append('title')
      .attr('class', 'tooltip')
      .text((d, i) => {
        return 'waarschuwing waardes' + escalationLevels[i].c + '' + d
      })

    this.sections = this.axis.canvas
      .select('.axis-canvas')
      .append('g')
      .attr('class', 'warning-sections')

    this.redraw()
  }

  redraw(): void {
    const scaleY = this.axis.yScale[0].copy()
    const scaleX = this.axis.xScale[0].copy()
    const domainY = scaleY.domain()

    const bisect = d3.bisector((data:any) => {
      return data.date
    }).left
    const escalationLevels = this.escalationLevels
    const tickLevels = escalationLevels
      .map(el => {
        // set label at height of level at right side of chart
        const idx = bisect(el.events, scaleX.domain()[1])
        return {id: el.id, val: el.events[idx].value}
      })
      .filter(el => {
        return el.val >= domainY[0] && el.val <= domainY[1]
      })
    const tickValues = tickLevels
      .map(el => {
        return el.val
      })

    this.warningAxis
      .scale(scaleY)
      .tickValues(tickValues)
      .tickFormat((d, i) => {
        return tickLevels[i].id
      })

    const transition = d3.transition().duration(this.transitionTime)
    this.axis.canvas
      .select('.y2-axis')
      .attr('transform', 'translate(' + this.axis.width + ' ,0)')
      .transition(transition)
      .call(this.warningAxis)

    function generateAreaGenerator(d, i) {
      const areaGen =  d3.area()
        .curve(d3.curveStepAfter)
        .x((e: any, j) => { return scaleX(e.date); })
      if (d.c === '<') {
        if (i === 0 ) { //set lower bound to bottom of chart
          areaGen.y0((e, j) => { return scaleY(domainY[0]); })
        } else { // set lower bound to value of the threshold below this one
          areaGen.y0((e, j) => { return scaleY(escalationLevels[i - 1].events[j].value); })
        }
        // set upper bound to value of this threshold
        areaGen.y1((e: any, j) => { return scaleY(e.value); })
      } else if (d.c === '>'){
        // set lower bound to value of this threshold
        areaGen.y0((e: any, j) => { return scaleY(e.value); })
        if ( i === escalationLevels.length - 1) {
          // set upper bound to top of chart
          areaGen.y1((e, j) => { return scaleY(domainY[1]); })
        } else {
          // set upper bound to value of threshold above this one
          areaGen.y1((e, j) => { return scaleY(escalationLevels[i + 1].events[j].value); })
        }
      }
      return areaGen
    }

    const areas = this.sections
      .selectAll('path')
      .data(escalationLevels)

    areas.exit().remove()
    areas
      .enter()
      .append('path')
      .merge(areas)
      .style('fill', (d) =>  {return d.color; })
      .attr('d', (d,i) => { return generateAreaGenerator(d, i)(d.events); })

  }
}
