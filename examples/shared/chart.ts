import { Axes, toggleChartVisibility } from "../../src";

export function toggleChart(element: HTMLElement, axis: Axes) {
  const ids = element.getAttribute('data-id').split(',');
  for (const id of ids) {
    toggleChartVisibility(axis, id);
  }
}
