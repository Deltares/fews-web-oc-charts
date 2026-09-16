import * as d3 from 'd3'
import { isNull } from 'lodash-es'
import { Axes } from '../Axes/axes.js'
import { CartesianAxes } from '../index.js'
import { Visitor } from './visitor.js'

export interface WarningLevelOptions {
  y?: {
    axisIndex: number
  }
}

export interface WarningLevelEvent {
  date: Date
  value: number | null
}

export interface EscalationLevel {
  id: string
  color: string
  c: string
  events: WarningLevelEvent[]
}

export class WarningLevels implements Visitor {
  public escalationLevels: EscalationLevel[]
  private axis!: CartesianAxes
  private scale!: d3.ScaleLinear<number, number>
  private warningAxis: any
  private sections!: d3.Selection<SVGGElement, unknown, null, unknown>
  private readonly options: any

  constructor(escalationLevels: EscalationLevel[], options: WarningLevelOptions) {
    this.escalationLevels = escalationLevels
    this.options = {
      y: { axisIndex: 0 },
      ...options,
    }
  }

  visit(axis: Axes): void {
    this.axis = axis as CartesianAxes
    this.create(axis as CartesianAxes)
  }

  create(axis: CartesianAxes): void {
    this.scale = d3.scaleLinear()
    this.scale
      .domain(axis.yScales[this.options.y.axisIndex].domain())
      .range(axis.yScales[this.options.y.axisIndex].range())
    const escalationLevels = this.escalationLevels

    this.warningAxis = d3
      .axisRight(this.scale)
      .tickValues([])
      .tickFormat(() => '')

    axis.canvas
      .append('g')
      .attr('class', 'axis y2-axis')
      .attr('transform', 'translate(' + axis.width + ' ,0)')

    const axisHandle = axis.canvas.select('.y2-axis').call(this.warningAxis)
    axisHandle
      .selectAll('.tick text')
      .append('title')
      .attr('class', 'tooltip')
      .text((d: any, i) => 'waarschuwing waardes' + escalationLevels[i].c + '' + d)

    this.sections = this.axis.canvas.select('.canvas').append('g').attr('class', 'warning-sections')

    this.redraw()
  }

  redraw(): void {
    const scaleY = this.axis.yScales[0].copy()
    const scaleX = this.axis.xScales[0].copy()
    const domainY = scaleY.domain()

    const bisector = d3.bisector((data: { date: Date }) => data.date)

    const escalationLevels = this.escalationLevels ?? []
    const tickLevels = escalationLevels
      .map((el) => {
        // set label at height of level at right side of chart
        const idx = bisector.left(el.events, scaleX.domain()[1])
        return { id: el.id, val: el.events[Math.max(0, idx - 1)].value }
      })
      .filter((el): el is { id: string; val: number } => {
        return el.val != null && el.val >= domainY[0] && el.val <= domainY[1]
      })
    const tickValues = tickLevels.map((el) => {
      return el.val
    })

    this.warningAxis
      .scale(scaleY)
      .tickValues(tickValues)
      .tickFormat((d: d3.NumberValue, i: number) => {
        return tickLevels[i].id
      })

    this.axis.canvas
      .select('.y2-axis')
      .attr('transform', 'translate(' + this.axis.width + ' ,0)')
      .call(this.warningAxis)

    function generateAreaGenerator(d: EscalationLevel, i: number) {
      const areaGen = d3
        .area<WarningLevelEvent>()
        .curve(d3.curveStepAfter)
        .defined((e) => !isNull(e.value))
        .x((e) => scaleX(e.date))

      if (d.c === '<') {
        if (i === 0) {
          //set lower bound to bottom of chart
          areaGen.y0(() => scaleY(domainY[0]))
        } else {
          // set lower bound to value of the threshold below this one
          areaGen.y0((e, j) => scaleY(escalationLevels[i - 1].events[j].value))
        }

        // set upper bound to value of this threshold
        areaGen.y1((e) => scaleY(e.value))
      } else if (d.c === '>') {
        // set lower bound to value of this threshold
        areaGen.y0((e) => scaleY(e.value))

        if (i === escalationLevels.length - 1) {
          // set upper bound to top of chart
          areaGen.y1(() => scaleY(domainY[1]))
        } else {
          // set upper bound to value of threshold above this one
          areaGen.y1((e, j) => scaleY(escalationLevels[i + 1].events[j].value))
        }
      }
      return areaGen
    }

    const areas = this.sections
      .selectAll<SVGPathElement, EscalationLevel>('path')
      .data(escalationLevels)

    areas.exit().remove()
    areas
      .enter()
      .append('path')
      .merge(areas)
      .style('fill', (d) => {
        return d.color
      })
      .attr('d', (d, i) => {
        return generateAreaGenerator(d, i)(d.events)
      })
  }
}
