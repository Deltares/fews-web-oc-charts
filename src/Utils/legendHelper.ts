import { Axis } from '../Axis'

export function toggleChartVisisbility(axis: Axis, id: string): void {
  for (const chart of axis.charts.filter(c => c.id === id)) {
    chart.visible = !chart.visible
  }
}
