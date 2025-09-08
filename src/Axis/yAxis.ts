import { textAnchorForAngle } from '../Utils/textAnchorForAngle.js'
import { Axis, BaseAxisOptions } from './axis.js'
import { AxisOrientation } from './axisOrientation.js'
import { AxisPosition } from './axisPosition.js'

export class YAxis extends Axis {
  constructor(
    group: d3.Selection<SVGGElement, unknown, null, unknown>,
    scale: any,
    spanScale: any,
    options: Partial<BaseAxisOptions>,
  ) {
    if (options.orientation === undefined) {
      options.orientation =
        options.position !== undefined && options.position !== AxisPosition.AtZero
          ? options.position
          : AxisOrientation.Left
    }
    if (options.position === undefined) {
      options.position = AxisOrientation.Left
    }
    super(group, scale, spanScale, options)
  }

  translateAxis(position): string {
    if (position === AxisPosition.AtZero) {
      return `translate(${this.spanScale(0)},0)`
    } else if (position === AxisPosition.Right) {
      return `translate(${this.spanScale.range()[1]},0)`
    }
    return ''
  }

  translateTickLabels(orientation: AxisOrientation, angle: number) {
    switch (angle) {
      case 0:
        break
      case 180:
        this.group.selectAll('text').attr('transform', `rotate(${angle})`)
        break
      default: {
        const anchor = textAnchorForAngle(angle, orientation)
        const offset = orientation === AxisOrientation.Right ? 15 : -15
        this.group
          .selectAll('text')
          .attr('x', null)
          .attr('dx', null)
          .attr('y', null)
          .attr('dy', null)
          .attr('text-anchor', anchor)
          .attr('dominant-baseline', 'middle')
          .attr('transform', `translate(${offset}, 0) rotate(${angle})`)
      }
    }
  }
}
