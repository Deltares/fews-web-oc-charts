import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './matrix.css'

import '@shared/theme-button'

import exampleDataComplete from './example-data.json'

import { AxisType, CartesianAxes, ChartMatrix, TooltipAnchor } from '@lib'

interface ExampleMatrixData {
  i: number
  j: number
  value: number | null
}
function generateExampleMatrix(
  numRows: number,
  numCols: number,
  fractionNull: number,
): ExampleMatrixData[] {
  const data = []
  for (let i = 0; i < numRows; i++) {
    for (let j = 0; j < numCols; j++) {
      const value = Math.random() < fractionNull ? null : Math.random()
      data.push({ i, j, value })
    }
  }
  return data
}

function createMatrixAxes(containerId: string): CartesianAxes {
  const container = document.getElementById(containerId)
  return new CartesianAxes(container, null, null, {
    x: [{ type: AxisType.band }],
    y: [{ type: AxisType.band }],
    margin: {
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    automargin: true,
  })
}

// Create matrix plot showing the (random) sparsity pattern of a matrix.
const axesSparse = createMatrixAxes('chart-container-sparsity')
const matrixData = generateExampleMatrix(25, 25, 0.7)
const matrixSparse = new ChartMatrix(matrixData, {
  x: {
    paddingOuter: 0,
    paddingInner: 0.2,
  },
  y: {
    paddingOuter: 0,
    paddingInner: 0.2,
  },
  color: {
    // Use a color map that unconditionally returns black; null values will
    // still be omitted.
    map: () => 'blue',
  },
})
matrixSparse.addTo(
  axesSparse,
  {
    x: { key: 'i', axisIndex: 0 },
    y: { key: 'j', axisIndex: 0 },
    color: { key: 'value' },
  },
  'example-sparse',
  {},
)
axesSparse.redraw({})

// Create matrix plot for color-mapped availability data.
const colorForAvailability = (availability: string) => {
  switch (availability) {
    case 'validated':
      return 'green'
    case 'warning':
      return 'yellow'
    case 'error':
      return 'red'
    case 'unvalidated':
      return 'grey'
    default:
      return 'black'
  }
}
const axesAvailability = createMatrixAxes('chart-container-availability')
const matrixAvailability = new ChartMatrix(exampleDataComplete, {
  x: {
    paddingOuter: 0.1,
    paddingInner: 0.2,
  },
  y: {
    paddingOuter: 0.1,
    paddingInner: 0.2,
  },
  color: { map: colorForAvailability },
  // Tooltips are disabled by default; if any configuration is set on a tooltip,
  // it will be displayed.
  tooltip: {
    anchor: TooltipAnchor.Top,
  },
})
matrixAvailability.addTo(
  axesAvailability,
  {
    x: { key: 'date', axisIndex: 0 },
    y: { key: 'series', axisIndex: 0 },
    color: { key: 'availability' },
  },
  'example-complete',
  {},
)

// Note: we cannot redraw with autoscale enabled, as this cuts off data. See
//       issue #132.
axesAvailability.redraw({})
