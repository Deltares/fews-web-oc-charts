import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './spectrum.css'

import * as d3 from 'd3'
import {
  AUTO_SCALE,
  AxisPosition,
  CartesianAxes,
  ChartHistogram,
  ChartRange,
  Direction,
  PolarAxes,
  TooltipAnchor,
} from '@lib'
import { addListenerByClassName } from '@shared'

function randomSpectrum(a) {
  const spectrum = []
  for (let i = 0; i < 50; i++) {
    spectrum.push({
      x: 50 + i * 100,
      y: a * d3.randomUniform()(),
    })
  }
  return spectrum
}
// set constants
const container1 = document.getElementById('chart-container-1')
const polarAxis = new PolarAxes(container1, null, null, {
  angular: {
    direction: Direction.CLOCKWISE,
  },
  innerRadius: 0.2,
})
const polarData = [
  [
    {
      x: [1, 2],
      y: [35, 85],
      v: 0,
    },
    {
      x: [2, 3],
      y: [30, 75],
      v: 0.5,
    },
    {
      x: [3, 4],
      y: [40, 65],
      v: 1,
    },
    {
      x: [4, 5],
      y: [50, 95],
      v: 2,
    },
    {
      x: [5, 6],
      y: [45, 90],
      v: 0.5,
    },
    {
      x: [6, 7],
      y: [-10, 15],
      v: 0,
    },
  ],
  [
    {
      x: [0.1, 0.2],
      y: [15, 75],
      v: 0,
    },
    {
      x: [0.2, 0.3],
      y: [10, 85],
      v: 7.5,
    },
    {
      x: [0.3, 0.4],
      y: [10, 85],
      v: 8.5,
    },
    {
      x: [0.4, 0.5],
      y: [10, 85],
      v: 10,
    },
    {
      x: [0.5, 0.6],
      y: [15, 80],
      v: 10.5,
    },
  ],
]
const plot = new ChartRange(polarData[0], {
  colorScale: AUTO_SCALE,
  tooltip: { anchor: TooltipAnchor.Pointer },
})
const random = []
for (let i = 0; i < 100; i++) {
  random.push({
    x: d3.randomUniform(0, 1)(),
    y: d3.randomUniform(0, 360)(),
  })
}

const spectra = randomSpectrum(1)
const plot4 = new ChartHistogram(spectra, {
  colorScale: AUTO_SCALE,
  tooltip: { anchor: TooltipAnchor.Top },
})
plot.addTo(polarAxis, {
  radial: {
    key: 'x',
    axisIndex: 0,
  },
  angular: {
    key: 'y',
    axisIndex: 0,
  },
  color: {
    key: 'v',
  },
})
const container2 = document.getElementById('chart-container-2')
const axis = new CartesianAxes(container2, null, null, {
  x: [
    {
      position: AxisPosition.Bottom,
      axisIndex: 0,
    },
  ],
  y: [
    {
      position: AxisPosition.Left,
      axisIndex: 0,
    },
  ],
})

plot4.addTo(
  axis,
  {
    x: {
      key: 'x',
      axisIndex: 0,
    },
    y: {
      key: 'y',
      axisIndex: 0,
    },
    color: {
      key: 'y',
    },
  },
  'histogram',
  '#cartesian-histogram'
)
axis.redraw({
  x: {
    autoScale: true,
  },
  y: {
    autoScale: true,
  },
})
polarAxis.redraw()
let count = 0
const updateCharts = function () {
  const newData = randomSpectrum(count + 1)
  plot4.data = newData
  axis.redraw({
    y: {
      autoScale: true,
    },
  })
  count++
  plot.data = polarData[count % 2]
  polarAxis.redraw()
}
const input = document.getElementById('slider')
input.onchange = function (event) {
  updateCharts(event)
}

addListenerByClassName('theme-button', 'click', () =>
  document.documentElement.classList.toggle('dark')
)
