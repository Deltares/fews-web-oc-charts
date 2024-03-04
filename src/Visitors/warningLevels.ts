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

export class WarningLevels implements Visitor {
  public escalationLevels: any[]
  private group: any
  private axis: CartesianAxes
  private scale: any
  private warningAxis: any
  private sections: any
  private labels: any
  private options: any

  constructor(escalationLevels, options: WarningLevelOptions) {
    this.escalationLevels = escalationLevels
    this.options = {
      ...{
        y: { axisIndex: 0 },
      },
      ...options,
    }
  }

  visit(axis: Axes): void {
    this.axis = axis as CartesianAxes
    this.create(axis as CartesianAxes)
  }

  create(axis: CartesianAxes): void {
    const scale = (this.scale = d3.scaleLinear())
    this.scale
      .domain(axis.yScales[this.options.y.axisIndex].domain())
      .range(axis.yScales[this.options.y.axisIndex].range())
    const escalationLevels = this.escalationLevels

    const tickValues = escalationLevels
      .filter((el) => {
        const domain = scale.domain()
        return !isNull(el.val) && el.val >= domain[0] && el.val <= domain[1]
      })
      .map((el) => {
        return el.val
      })

    this.warningAxis = d3
      .axisRight(this.scale)
      .tickValues(tickValues)
      .tickFormat((d) => {
        const level = escalationLevels.find((l) => l.val === d)
        return level.id
      })


    const adjustTextLabels = (selection) => {
      const escalationLevels = this.escalationLevels
      selection
        .selectAll('text')
        .attr('transform', (d) => {
          const level = escalationLevels.find((l) => l.levelStart === d)
          const offset = level.c === '>' ? -10 : 10
          return `translate(0, ${offset})`
        })
        .attr('fill', (d) => {
          const level = escalationLevels.find((l) => l.levelStart === d)
          return level.textColor
        })
    }

    this.sections = this.axis.canvas.select('.canvas').append('g').attr('class', 'warning-sections')
    this.labels = this.axis.canvas.select('.canvas').append('g').attr('class', 'warning-labels')

    const axisHandle = this.labels.call(this.warningAxis).call(adjustTextLabels)

      axisHandle
        .selectAll('.tick text')
        .append('title')
        .attr('class', 'tooltip')
        .text((d, i) => {
          return 'waarschuwing waardes' + escalationLevels[i].c + '' + d
        })


    this.redraw()
  }

  redraw(): void {
    const scaleY = this.axis.yScales[0].copy()
    const scaleX = this.axis.xScales[0].copy()
    const domainY = scaleY.domain()

    const bisect = d3.bisector((data: any) => {
      return data.date
    }).left

    const escalationLevels = this.escalationLevels ?? []
    const tickLevels = escalationLevels
      .map((el) => {
        // set label at height of level at right side of chart
        const idx = bisect(el.events, scaleX.domain()[0])
        return { id: el.id, val: el.events[Math.max(0, idx - 1)].value }
      })
      .filter((el) => {
        return !isNull(el.val) && el.val >= domainY[0] && el.val <= domainY[1]
      })
    const tickValues = tickLevels.map((el) => {
      return el.val
    })

    this.warningAxis
      .scale(scaleY)
      .tickValues(tickValues)
      .tickFormat((d, i) => {
        return tickLevels[i].id
      })

    const adjustTextLabels = (selection) => {
      const escalationLevels = this.escalationLevels
      selection
        .selectAll('text')
        .attr('transform', (d) => {
          const level = escalationLevels.find((l) => l.levelStart === d)
          const offset = level.c === '>' ? -10 : 10
          return `translate(0, ${offset})`
        })
        .attr('fill', (d) => {
          const level = escalationLevels.find((l) => l.levelStart === d)
          return level.textColor
        })
    }

    this.labels
      .call(this.warningAxis)
      .call(adjustTextLabels)

    function generateAreaGenerator(d, i) {
      const areaGen = d3
        .area()
        .curve(d3.curveStepAfter)
        .defined((e: any) => !isNull(e.value))
        .x((e: any, j) => {
          return scaleX(e.date)
        })
      if (d.c === '<') {
        if (i === 0) {
          //set lower bound to bottom of chart
          areaGen.y0((e, j) => {
            return scaleY(domainY[0])
          })
        } else {
          // set lower bound to value of the threshold below this one
          areaGen.y0((e, j) => {
            return scaleY(escalationLevels[i - 1].events[j].value)
          })
        }
        // set upper bound to value of this threshold
        areaGen.y1((e: any, j) => {
          return scaleY(e.value)
        })
      } else if (d.c === '>') {
        // set lower bound to value of this threshold
        areaGen.y0((e: any, j) => {
          return scaleY(e.value)
        })
        if (i === escalationLevels.length - 1) {
          // set upper bound to top of chart
          areaGen.y1((e, j) => {
            return scaleY(domainY[1])
          })
        } else {
          // set upper bound to value of threshold above this one
          areaGen.y1((e, j) => {
            return scaleY(escalationLevels[i + 1].events[j].value)
          })
        }
      }
      return areaGen
    }

    const areas = this.sections.selectAll('path').data(escalationLevels)

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
