import '../../src/scss/wb-charts.scss'
import '../shared/shared.css'
import './availability.css'

import * as d3 from 'd3'

import { AxisType, CartesianAxes, ChartMatrix, TooltipAnchor } from '../../src'
import { addListenerByClassName } from '../shared'

const colorMap = function (value) {
  const colors = {
    validated: '#2fcc66',
    filled: '#1e7b3f',
    warning: 'yellow',
    error: 'red',
    unvalidated: 'grey',
  }
  return colors[value]
}

// set constants
const container1 = document.getElementById('chart-container-1')
const axis1 = new CartesianAxes(container1, null, null, {
  margin: {
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  x: [
    {
      type: AxisType.band,
      position: 'top',
    },
  ],
  y: [
    {
      type: AxisType.band,
    },
  ],
})

const container2 = document.getElementById('chart-container-2')
const axis2 = new CartesianAxes(container2, null, null, {
  margin: {
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  x: [
    {
      type: AxisType.band,
      position: 'top',
    },
  ],
  y: [
    {
      type: AxisType.band,
    },
  ],
})

d3.json('available_aberdeen.json')
  .then((data) => {
    const plotMatrix1 = new ChartMatrix(data, {
      x: {
        paddingOuter: 0,
        paddingInner: 0.4,
      },
      y: {
        paddingOuter: 0,
        paddingInner: 0,
      },
      color: {
        map: colorMap,
      },
      tooltip: {
        anchor: TooltipAnchor.Top,
      },
    })
    plotMatrix1.addTo(
      axis1,
      {
        x: {
          key: 'date',
          axisIndex: 0,
        },
        y: {
          key: 'series',
          axisIndex: 0,
        },
        color: {
          key: 'value',
        },
      },
      'matrix',
      {}
    )

    axis1.redraw({})
  })
  .catch((error) => console.error(`Failed to create chart: ${error}`))

d3.json('available_aberdeen.json')
  .then((data) => {
    const plotMatrix2 = new ChartMatrix(data, {
      x: {
        paddingOuter: 0,
        paddingInner: 0.4,
      },
      y: {
        paddingOuter: 0,
        paddingInner: 0.1,
      },
      color: {
        map: colorMap,
      },
      tooltip: {
        anchor: TooltipAnchor.Top,
      },
    })
    plotMatrix2.addTo(
      axis2,
      {
        x: {
          key: 'date',
          axisIndex: 0,
        },
        y: {
          key: 'series',
          axisIndex: 0,
        },
        color: {
          key: 'value',
        },
      },
      'matrix',
      {}
    )

    axis2.redraw({})
  })
  .catch((error) => console.error(`Failed to create chart: ${error}`))

addListenerByClassName('theme-button', 'click', () =>
  document.documentElement.classList.toggle('dark')
)
