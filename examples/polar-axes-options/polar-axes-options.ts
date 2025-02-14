import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './polar-axes-options.css'

import '@shared/theme-button'
import { ChartLine, Direction, PolarAxes } from '@lib'
import { generateExamplePolarData } from '@shared'

// Create example line to show in all the plots.
const exampleData = generateExamplePolarData([0, 10], [0, 5], 50)

const createPolarAxesExample = (
  rowContainerId: string,
  direction: Direction,
  range: [number, number],
  intercept: number,
): void => {
  const container1 = document.getElementById(rowContainerId)
  const axes = new PolarAxes(container1, null, null, {
    angular: {
      direction,
      range,
      intercept,
      domain: [0, 10],
    },
    radial: {},
  })
  const line = new ChartLine(exampleData, {})
  line.addTo(
    axes,
    {
      radial: { key: 'radial', axisIndex: 0 },
      angular: { key: 'angular', axisIndex: 0 },
    },
    'example-line',
    { fill: 'none', stroke: 'skyblue', 'stroke-width': '2' },
  )
  axes.redraw()
}

// Note: the angular range is currently expected to start with 0, or the axes
//       are drawn incorrectly. See issue #149.

// Clockwise examples.
createPolarAxesExample('chart-container-1-1', Direction.CLOCKWISE, [0, Math.PI], Math.PI / 2)
createPolarAxesExample('chart-container-1-2', Direction.CLOCKWISE, [0, 0.5 * Math.PI], Math.PI / 4)
createPolarAxesExample('chart-container-1-3', Direction.CLOCKWISE, [0, 1.25 * Math.PI], 0)

// Note: setting the range below [0, Math.PI] results in incorrect axes. See
//       issue #149.

// Counterclockwise examples.
createPolarAxesExample('chart-container-2-1', Direction.ANTICLOCKWISE, [0, Math.PI], Math.PI / 2)
createPolarAxesExample('chart-container-2-2', Direction.ANTICLOCKWISE, [0, Math.PI], Math.PI / 4)
createPolarAxesExample('chart-container-2-3', Direction.ANTICLOCKWISE, [0, 1.25 * Math.PI], 0)
