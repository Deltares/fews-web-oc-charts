import { Axes, toggleChartVisibility } from "../src"

export function percentile(p: number | number[], data: number[]) {
  const points = data
  points.sort(function (a, b) {
    return a - b
  })
  if (Array.isArray(p)) {
    const result = []
    for (let i = 0; i < p.length; ++i) {
      const x = p[i] * (points.length + 1)
      const x1 = Math.floor(x)
      const frac = x - x1
      result.push(points[x1 - 1] + frac * (points[x1] - points[x1 - 1]))
    }
    return result
  } else {
    const x = p * (points.length + 1)
    const x1 = Math.floor(x)
    const frac = x - x1
    return points[x1 - 1] + frac * (points[x1] - points[x1 - 1])
  }
}

export function toggleChart(element: HTMLElement, axis: Axes) {
  const ids = element.getAttribute('data-id').split(',')
  for (const id of ids) {
    toggleChartVisibility(axis, id)
  }
}

/**
 * Adds a click event listener to element with the specified id.
 * @param {string} id - The id of the element to add the listener to.
 * @param {string} eventType - The type of event to listen for (e.g., 'click', 'mouseover').
 * @param {Function} listenerFunction - The function to be executed when the event is triggered.
 */
export function addListenerById(id, eventType, listenerFunction) {
  const buttons = document.getElementById(id)
  buttons.addEventListener(eventType, (event) => listenerFunction(event))
}

/**
 * Adds a click event listener to elements with the specified class name.
 * @param {string} className - The class name of the elements to add the listener to.
 * @param {string} eventType - The type of event to listen for (e.g., 'click', 'mouseover').
 * @param {Function} listenerFunction - The function to be executed when the event is triggered.
 */
export function addListenerByClassName(className, eventType, listenerFunction) {
  const buttons = document.getElementsByClassName(className)
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener(eventType, (event) => listenerFunction(event))
  }
}
