import * as d3 from 'd3'
import { CartesianAxes, PolarAxes } from '../index.js'
import { Chart, CurveType, PointBisectMethod } from './chart.js'
import { TooltipPosition } from '../Tooltip/tooltip.js'

export class ChartLine extends Chart {
  defaultToolTipFormatterCartesian(d): HTMLElement {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const html = document.createElement('div')
    if (this.options.x.includeInTooltip) {
      const spanElement = document.createElement('span')
      spanElement.innerText = this.defaultToolTipText([d[0][xKey], d[1][xKey]], xKey, 2)
      html.appendChild(spanElement)
    }
    if (this.options.y.includeInTooltip) {
      const spanElement = document.createElement('span')
      spanElement.innerText = this.defaultToolTipText([d[0][yKey], d[1][yKey]], yKey, 2)
      html.appendChild(spanElement)
    }
    return html
  }

  defaultToolTipFormatterPolar(d): HTMLElement {
    const tKey = this.dataKeys.angular
    const rKey = this.dataKeys.radial
    const html = document.createElement('div')
    if (this.options.angular.includeInTooltip) {
      const spanElement = document.createElement('span')
      spanElement.innerText = this.defaultToolTipText([d[0][tKey], d[1][tKey]], tKey, 0)
      html.appendChild(spanElement)
    }
    if (this.options.radial.includeInTooltip) {
      const spanElement = document.createElement('span')
      spanElement.innerText = this.defaultToolTipText([d[0][rKey], d[1][rKey]], rKey, 0)
      html.appendChild(spanElement)
    }
    return html
  }

  plotterCartesian(axis: CartesianAxes, axisIndex: any) {
    const xKey = this.dataKeys.x
    const yKey = this.dataKeys.y
    const xScale = axis.xScales[axisIndex.x.axisIndex]
    const yScale = axis.yScales[axisIndex.y.axisIndex]

    const mappedData = this.mapDataCartesian(xScale.domain())
    this.datum = mappedData

    this.highlight = this.selectHighlight(axis, 'circle')
    this.highlight.select('circle').attr('r', 3).style('opacity', 0).style('stroke-width', '1px')

    const lineGenerator = d3
      .line()
      .x(function (d: any) {
        return xScale(d[xKey])
      })
      .y(function (d: any) {
        return yScale(d[yKey])
      })
      .defined(function (d: any) {
        return d[yKey] != null
      })
    const curve = this.curveGenerator
    if (curve !== undefined) {
      lineGenerator.curve(curve)
    }

    this.group = this.selectGroup(axis, 'chart-line')
    if (this.group.select('path').size() === 0) {
      this.group.append('path')
    }
    const update = this.group.select('path').datum(mappedData).join('path').attr('d', lineGenerator)

    if (this.options.tooltip !== undefined) {
      update
        .on('pointerover', (e: any, d: any) => {
          axis.tooltip.show()
          const pointer = d3.pointer(e, axis.container)
          axis.tooltip.update(
            this.toolTipFormatterCartesian(d),
            TooltipPosition.Top,
            pointer[0],
            pointer[1]
          )
        })
        .on('pointerout', () => {
          axis.tooltip.hide()
        })
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  plotterPolar(axis: PolarAxes, axisIndex: any) {
    const rKey = this.dataKeys.radial
    const tKey = this.dataKeys.angular
    const lineGenerator = d3
      .lineRadial()
      .angle(function (d: any) {
        return axis.angularScale(d[tKey])
      })
      .radius(function (d: any) {
        return axis.radialScale(d[rKey])
      })
    this.group = this.selectGroup(axis, 'chart-line')
    if (this.group.select('path').size() === 0) {
      this.group.append('path')
    }
    const line = this.group.select('path')

    const t = d3.transition().duration(this.options.transitionTime).ease(d3.easeLinear)

    line.transition(t).attr('d', lineGenerator(this.data))
    line.join('path').datum(this.data)
    if (this.options.tooltip !== undefined) {
      line
        .on('pointerover', (e: any, d: any) => {
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

  drawLegendSymbol(_legendId?: string, asSvgElement?: boolean) {
    const props = ['stroke', 'stroke-width', 'stroke-dasharray']
    const source = this.group.select('path').node() as Element
    const svg = d3.create('svg').attr('width', 20).attr('height', 20)
    const group = svg.append('g').attr('transform', 'translate(0, 10)')
    const element = group.append('line').attr('x1', 0).attr('x2', 20).attr('y1', 0).attr('y2', 0)
    this.applyStyle(source, element, props)
    if (asSvgElement) return element.node()
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
    const element = this.group.select('path')
    if (element.node() === null) {
      return { point, style: {} }
    } else {
      const color = window.getComputedStyle(element.node() as Element).getPropertyValue('stroke')
      return { point, style: { color } }
    }
  }
}
