import { Axes } from '../Axes/axes.js'

export function toggleChartVisisbility(axis: Axes, id: string): void {
  for (const chart of axis.charts.filter(c => c.id === id)) {
    chart.visible = !chart.visible
  }
}
