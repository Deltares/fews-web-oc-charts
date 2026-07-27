import * as d3 from 'd3'
import { bboxCollide } from '../Utils/bboxCollide.js'

export type CrossSectionPoint = {
  id: string
  x?: number
  y?: number
  value?: string
  d: any
}

export type CrossSectionPointStyles = Record<string, CSSStyleDeclaration>

type CrossSectionLabelNode = {
  id?: string
  fx?: number
  fy?: number
  x?: number
  y?: number
  py?: number
  label?: string
  width: number
  height: number
}

type CrossSectionLabelLink = {
  source: CrossSectionLabelNode
  target: CrossSectionLabelNode
  label: string
}

type CrossSectionLabelLayout = {
  nodes: CrossSectionLabelNode[]
  links: CrossSectionLabelLink[]
}

export class CrossSectionSelectRenderer {
  private simulation?: d3.Simulation<any, any>

  updateLine(params: {
    backGroup: any
    axisHeight: number
    xPos: number
    visible: boolean
    value: number | Date
    format: (value: number | { valueOf(): number } | Date) => string
  }): void {
    const { backGroup, axisHeight, xPos, visible, value, format } = params
    const visibility = visible ? 'visible' : 'hidden'
    backGroup
      .select('line')
      .attr('y1', 0)
      .attr('y2', axisHeight)
      .attr('transform', 'translate(' + xPos + ', 0)')
      .style('visibility', visibility)
    backGroup
      .select('.date-label')
      .attr('x', xPos)
      .text(format(value))
      .style('visibility', visibility)
    backGroup
      .select('.cross-section-select-handle')
      .attr('transform', 'translate(' + xPos + ',' + axisHeight + ')')
      .style('visibility', visibility)
  }

  updateDataPoints(params: {
    frontGroup: any
    points: CrossSectionPoint[]
    styles: CrossSectionPointStyles
    pointRadius: number
    visible: boolean
  }): void {
    const { frontGroup, points, styles, pointRadius, visible } = params
    const visibility = visible ? 'visible' : 'hidden'
    frontGroup
      .selectAll('.data-point-per-line')
      .selectAll('circle')
      .data(points)
      .join('circle')
      .filter((d: any) => d.y !== undefined)
      .attr('data-point-id', (d: any) => d.id)
      .attr('r', pointRadius)
      .style('fill', (d: any) => {
        const style = styles[d.id]
        return style.getPropertyValue('stroke')
      })
      .style('visibility', visibility)
      .style('stroke-width', '1px')
      .style('opacity', '1')
      .attr('transform', (d: any) => `translate( ${d.x}, ${d.y})`)
  }

  updateLabels(params: {
    backGroup: any
    frontGroup: any
    points: CrossSectionPoint[]
    styles: CrossSectionPointStyles
    pointRadius: number
    visible: boolean
  }): void {
    const { backGroup, frontGroup, points, styles, pointRadius, visible } = params
    const visibility = visible ? 'visible' : 'hidden'
    const { nodes, links } = this.buildLabelLayout(points)

    const rectSelection = frontGroup
      .selectAll('.back')
      .data(nodes.filter((d: any) => d.label !== undefined))

    const rectsUpdate = rectSelection
      .join('rect')
      .classed('back', true)
      .attr('fill', 'rgb(0, 0 , 0)')
      .attr('stroke', 'none')
      .style('visibility', visibility)

    const labelsSelection = frontGroup
      .selectAll('.label')
      .data(nodes.filter((d: any) => d.label !== undefined))

    const labelsUpdate = labelsSelection
      .join('text')
      .classed('label', true)
      .attr('dominant-baseline', 'middle')
      .attr('fill', (d: any) => {
        const style = styles[d.id]
        return style.getPropertyValue('stroke')
      })
      .style('visibility', visibility)
      .attr('stroke', 'none')
      .text((d: any) => d.label)

    const link = backGroup
      .selectAll('.link')
      .data(links)
      .join('line')
      .style('visibility', visibility)
      .classed('link', true)

    const { widths, heights } = this.measureLabelBoxes(labelsUpdate, pointRadius)

    rectsUpdate
      .attr('rx', (d: any, j: number) => heights[2 * j] / 2)
      .attr('ry', (d: any, j: number) => heights[2 * j] / 2)
      .attr('width', (d: any, j: number) => widths[2 * j])
      .attr('height', (d: any, j: number) => heights[2 * j])

    const tick = (): void => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)
      rectsUpdate
        .attr('x', (d: any, j: number) => d.x - heights[2 * j] / 2)
        .attr('y', (d: any, j: number) => d.y - heights[2 * j] / 2)
      labelsUpdate.attr('x', (d: any) => d.x).attr('y', (d: any) => d.y)
    }

    if (this.simulation !== undefined) this.simulation.stop()

    const collisionForce = this.createCollisionForce(widths, heights)

    this.simulation = d3
      .forceSimulation()
      .alphaDecay(0.01)
      .nodes(nodes)
      .force('center', collisionForce)
      .on('tick', tick)
    this.simulation.stop()
    this.simulation.tick(50)
    tick()
  }

  private buildLabelLayout(points: CrossSectionPoint[]): CrossSectionLabelLayout {
    const nodes: CrossSectionLabelNode[] = []
    const links: CrossSectionLabelLink[] = []
    let i = 0
    const sortedPoint = [...points]
      .filter((point): point is CrossSectionPoint & { x: number; y: number } => {
        return point.x !== undefined && point.y !== undefined
      })
      .sort((a, b) => a.y - b.y)

    for (const p of sortedPoint) {
      nodes.push(
        {
          id: p.id,
          fx: p.x + 50,
          y: p.y + Math.random() / 10, // NOSONAR(S2245) - No cryptographic use
          py: p.y,
          label: p.value ?? '',
          width: 100,
          height: 20,
        },
        { fx: p.x, fy: p.y, width: 4, height: 4 },
      )
      links.push({ source: nodes[i + 1], target: nodes[i], label: p.value ?? '' })
      i = i + 2
    }

    return { nodes, links }
  }

  private measureLabelBoxes(
    labelsUpdate: any,
    pointRadius: number,
  ): { widths: number[]; heights: number[] } {
    const widths: number[] = []
    const heights: number[] = []
    const margin = 2
    const radius = 2 * pointRadius

    labelsUpdate.each(function (this: any) {
      const height = this.getBoundingClientRect().height + 2 * margin
      heights.push(height, radius)
      const width = this.getBoundingClientRect().width + height
      widths.push(width, radius)
    })

    return { widths, heights }
  }

  private createCollisionForce(widths: number[], heights: number[]) {
    return bboxCollide(function (d: any, j: number) {
      let bbox
      if (d.label !== undefined) {
        bbox = [
          [-heights[j] / 2, -heights[j] / 2],
          [widths[j] - heights[j] / 2, heights[j] / 2],
        ]
      } else {
        bbox = [
          [-widths[j] / 2, -heights[j] / 2],
          [widths[j] / 2, heights[j] / 2],
        ]
      }
      return bbox
    })
  }
}
