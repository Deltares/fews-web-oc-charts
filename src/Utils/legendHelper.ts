import { Axis } from '../Axis/axis.js'

export function toggleChartVisisbility(axis: Axis, id: string): void {
  for (const chart of axis.charts.filter(c => c.id === id)) {
    chart.visible = !chart.visible
  }
}
