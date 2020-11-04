import { Axis } from '../Axis'

export function toggleChartVisisbility(axis: Axis, id: string): boolean {
  const chartElement = axis.chartGroup
    .select(`[data-chart-id="${id}"]`)
    .select('path')
    .node() as Element
  if (chartElement) {
    const style = window.getComputedStyle(chartElement)
    const display = style.getPropertyValue('visibility')
    if (display === 'visible') {
      axis.chartGroup.selectAll(`[data-chart-id="${id}"]`).style('visibility', 'hidden')
    } else {
      axis.chartGroup.selectAll(`[data-chart-id="${id}"]`).style('visibility', 'visible')
    }
    return display !== 'visible'
  }
  return null
}
