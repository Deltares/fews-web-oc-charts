import * as d3 from 'd3'
import { defaultsDeep } from 'lodash-es'
import { CartesianAxes, CartesianAxesIndex, PolarAxes } from '../index.js'
import { TooltipAnchor, TooltipPosition } from '../Tooltip/tooltip.js'
import { Chart, CurveType, PointBisectMethod, SymbolOptions } from './chart.js'

function mean(x: number[] | number) {
  if (x instanceof Array) {
    return d3.mean(x)
  }
  return x
}

const DefaultSymbolOptions: SymbolOptions = {
  id: 0,
  size: 10,
  skip: 1,
}
export class ChartMarker extends Chart {
  private previousData: any[] = []

  constructor(data: any, options: any) {
    super(data, options)
    this.options = defaultsDeep(this.options, this.options, { symbol: DefaultSymbolOptions })
  }

  plotterCartesian(axis: CartesianAxes, axisIndex: CartesianAxesIndex) {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const xScale = axis.xScales[axisIndex.x.axisIndex]
    const yScale = axis.yScales[axisIndex.y.axisIndex]

    this.highlight = this.selectHighlight(axis, 'circle')
    this.highlight.select('circle').attr('r', 3).style('opacity', 0).style('stroke-width', '1px')

    const skip = this.options.symbol.skip
    const mappedData = this.mapDataCartesian(xScale.domain()).filter((d, i) => {
      return i % skip === 0 && d[yKey] !== null
    })

    this.datum = mappedData

    this.group = this.selectGroup(axis, 'chart-marker').datum(mappedData)
    const elements = this.group.selectAll<SVGPathElement, any>('path').data((d) => d)

    // exit selection
    elements.exit().remove()

    // enter + update selection
    elements
      .enter()
      .append('path')
      .attr('d', d3.symbol(d3.symbols[this.options.symbol.id], this.options.symbol.size))
      .merge(elements)
      .attr('transform', (d: any, i: number) => {
        return 'translate(' + xScale(d[xKey]) + ',' + yScale(d[yKey]) + ')'
      })
    if (this.options.tooltip !== undefined) {
      elements
        .on('pointerover', (e: any, d) => {
          if (
            this.options.tooltip.anchor !== undefined &&
            this.options.tooltip.anchor !== TooltipAnchor.Pointer
          ) {
            console.error(
              'Tooltip not implemented for anchor ',
              this.options.tooltip.anchor,
              ', using ',
              TooltipAnchor.Pointer,
              ' instead.'
            )
          }
          axis.tooltip.show()
          const pointer = d3.pointer(e, axis.container)
          axis.tooltip.update(
            this.toolTipFormatterPolar(d),
            this.options.tooltip.position !== undefined
              ? this.options.tooltip.position
              : TooltipPosition.Top,
            pointer[0],
            pointer[1]
          )
        })
        .on('pointerout', () => {
          axis.tooltip.hide()
        })
    }
  }

  plotterPolar(axis: PolarAxes, dataKeys: any) {
    this.group = this.selectGroup(axis, 'chart-marker')
    const rKey = this.dataKeys.radial
    const tKey = this.dataKeys.angular

    const elements = this.group.selectAll<SVGPathElement, any>('path').data(this.data)

    function arcTranslation(p) {
      // We only use 'd', but list d,i,a as params just to show can have them as params.
      // Code only really uses d and t.
      return function (d, i, a) {
        const old = p[i]
        if (mean(old[tKey]) - mean(d[tKey]) > 180) {
          old[tKey] = old[tKey] - 360
        } else if (mean(old[tKey]) - mean(d[tKey]) < -180) {
          old[tKey] = old[tKey] + 360
        }
        const tInterpolate = d3.interpolate(old[tKey], d[tKey])
        const rInterpolate = d3.interpolate(old[rKey], d[rKey])
        return function (x) {
          const theta = axis.angularScale(tInterpolate(x))
          const radius = axis.radialScale(rInterpolate(x))
          return 'translate(' + -radius * Math.sin(-theta) + ',' + -radius * Math.cos(-theta) + ')'
        }
      }
    }

    // exit selection
    elements.exit().remove()

    // enter + update selection
    elements
      .enter()
      .append('path')
      .attr('transform', (d: any, i: number) => {
        const r: number = axis.radialScale(d[rKey])
        const t: number = axis.angularScale(d[tKey])
        return 'translate(' + -r * Math.sin(-t) + ',' + -r * Math.cos(-t) + ')'
      })
      .attr('d', d3.symbol(d3.symbols[this.options.symbol.id], this.options.symbol.size))
      .merge(elements)
    if (this.options.tooltip !== undefined) {
      elements
        .on('pointerover', (e: any, d) => {
          if (
            this.options.tooltip.anchor !== undefined &&
            this.options.tooltip.anchor !== TooltipAnchor.Pointer
          ) {
            console.error(
              'Tooltip not implemented for anchor ',
              this.options.tooltip.anchor,
              ', using ',
              TooltipAnchor.Pointer,
              ' instead.'
            )
          }
          const pointer = d3.pointer(e, axis.container)
          const x = pointer[0]
          const y = pointer[1]
          axis.tooltip.show()
          axis.tooltip.update(
            this.toolTipFormatterPolar(d),
            this.options.tooltip.position !== undefined
              ? this.options.tooltip.position
              : TooltipPosition.Top,
            x,
            y
          )
        })
        .on('pointerout', () => {
          axis.tooltip.hide()
        })
    }

    const transition = d3.transition().duration(this.options.transitionTime).ease(d3.easeLinear)

    elements.transition(transition).attrTween('transform', arcTranslation(this.previousData))

    this.previousData = this.data
  }

  drawLegendSymbol(_legendId?: string, asSvgElement?: boolean) {
    const props = ['fill', 'stroke']
    const source = this.group.select('path').node() as Element
    const svg = d3.create('svg').append('svg').attr('width', 20).attr('height', 20)
    const outerGroup = svg.append('g').attr('transform', 'translate(0, 10)')
    // Make sure the marker is aligned horizontally even when returning the
    // "bare" SVG element.
    const innerGroup = outerGroup.append('g').attr('transform', 'translate(10, 0)')
    innerGroup
      .append('path')
      .attr('d', d3.symbol(d3.symbols[this.options.symbol.id], this.options.symbol.size))
    this.applyStyle(source, innerGroup, props)
    if (asSvgElement) return innerGroup.node()
    return svg.node()
  }

  public onPointerOver() {
    this.highlight
      .select('circle')
      .style('opacity', 1)
      .style('fill', () => {
        const element = this.group.select('path')
        if (element.node() === null) return
        return window.getComputedStyle(element.node() as Element).getPropertyValue('stroke')
      })
      .attr('transform', null)
  }

  public onPointerOut() {
    this.highlight.select('circle').style('opacity', 0)
  }

  public onPointerMove(x: number | Date, xScale, yScale) {
    let method: PointBisectMethod = 'center'
    if (this.options.curve === CurveType.StepBefore) {
      method = 'right'
    } else if (this.options.curve === CurveType.StepAfter) {
      method = 'left'
    }
    const index = this.findXIndex(x, method)
    const point = this.datum[index]
    if (point === undefined) {
      return
    }
    this.highlight.select('circle').attr('transform', () => {
      return `translate(${xScale(point.x)}, ${yScale(point.y)})`
    })
  }
}
