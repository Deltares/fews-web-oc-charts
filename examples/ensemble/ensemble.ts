import '../../src/scss/wb-charts.scss'
import '../shared.css'
import './ensemble.css'

import * as d3 from 'd3'
import {
  AxisPosition,
  AxisType,
  CartesianAxes,
  ChartArea,
  ChartLine,
  ChartMarker,
  WarningLevels,
} from '../../src'
import { addListenerByClassName, percentile } from '../shared'

const container1 = document.getElementById('chart-container-1')

const axis1 = new CartesianAxes(container1, null, null, {
  x: [
    {
      type: AxisType.time,
      label: 'datum',
      position: AxisPosition.AtZero,
      showGrid: false,
    },
  ],
  y: [
    {
      position: AxisPosition.Left,
      showGrid: true,
      nice: true,
      defaultDomain: [-150, 150],
      label: 'Waterstand',
      unit: 'cm',
    },
  ],
  margin: {
    left: 100,
    right: 100,
  },
})

const container2 = document.getElementById('chart-container-2')
const axis = new CartesianAxes(container2, null, null, {
  x: [
    {
      type: AxisType.time,
      label: 'datum',
      position: AxisPosition.AtZero,
      showGrid: false,
    },
  ],
  y: [
    {
      position: AxisPosition.Left,
      showGrid: true,
      nice: true,
      includeZero: true,
      label: 'Waterstand',
      unit: 'cm',
    },
  ],
  margin: {
    left: 100,
    right: 100,
  },
})
const escalationLevels = [
  {
    id: 'laag',
    events: [],
    levelStart: -80,
    levelEnd: -100,
    color: 'rgba(205, 133, 63,.5)',
    c: '<',
  },
  {
    id: 'verhoogd',
    events: [],
    levelStart: 80,
    levelEnd: 100,
    color: 'rgba(255, 215, 0,.5)',
    c: '>',
  },
  {
    id: 'hoog',
    events: [],
    levelStart: 120,
    levelEnd: 110,
    color: 'rgba(255, 150, 0,.5)',
    c: '>',
  },
  {
    id: 'extreem',
    events: [],
    levelStart: 130,
    levelEnd: 150,
    color: 'rgba(255, 0, 0,.5)',
    c: '>',
  },
]
const warnings = new WarningLevels(escalationLevels, {})
const warnings1 = new WarningLevels(escalationLevels, {})

d3.json('../data/ensemble.json')
  .then(function (data) {
    const nEnsemble = data.values[0].length
    const members = Array(nEnsemble)
    const percentiles = [[], [], []]

    for (let s = 0; s < nEnsemble; s++) {
      members[s] = []
    }
    data.times.forEach(function (time, index) {
      const dateTime = new Date(time * 1000)
      for (let i = 0; i < nEnsemble; i++) {
        members[i].push({
          x: dateTime,
          y: data.values[index][i],
        })
      }
      const points = data.values[index]
      percentiles[0].push({
        x: dateTime,
        y: percentile(0.5, points),
      })
      percentiles[1].push({
        x: dateTime,
        y: percentile([0.25, 0.75], points),
      })
      percentiles[2].push({
        x: dateTime,
        y: percentile([0.05, 0.95], points),
      })

      escalationLevels.forEach(function (el, i) {
        let val = el.levelStart
        if (index > data.times.length / 2) {
          val = el.levelEnd
        }
        el.events.push({
          date: dateTime,
          value: val,
        })
      })
    })

    for (let i = 1; i < nEnsemble; i++) {
      const plotEnsemble = new ChartLine(members[i], {})
      plotEnsemble.addTo(
        axis1,
        {
          x: {
            key: 'x',
            axisIndex: 0,
          },
          y: {
            key: 'y',
            axisIndex: 0,
          },
        },
        'ensemble-line',
        '.ensemble-line'
      )
    }
    const plotMedian = new ChartLine(percentiles[0], {})
    const plotControl = new ChartLine(members[0], {})
    plotControl.addTo(
      axis1,
      {
        x: {
          key: 'x',
          axisIndex: 0,
        },
        y: {
          key: 'y',
          axisIndex: 0,
        },
      },
      'control-line',
      '#control-line'
    )
    plotMedian.addTo(
      axis1,
      {
        x: {
          key: 'x',
          axisIndex: 0,
        },
        y: {
          key: 'y',
          axisIndex: 0,
        },
      },
      'median-line',
      '#median-line'
    )
    axis1.redraw({
      x: {
        autoScale: true,
      },
      y: {
        autoScale: true,
      },
    })
    axis1.accept(warnings)

    const plotControl1 = new ChartMarker(members[0], {})
    const plotMedian1 = new ChartLine(percentiles[0], {})
    const plotPercentile50 = new ChartArea(percentiles[1], {})
    const plotPercentile90 = new ChartArea(percentiles[2], {})

    plotPercentile90.addTo(
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
      },
      'percent90',
      '#percent90'
    )
    plotPercentile50.addTo(
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
      },
      'percent50',
      '#percent50'
    )
    plotControl1.addTo(
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
      },
      'control-line',
      '#control-line'
    )
    plotMedian1.addTo(
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
      },
      'median-line',
      {
        fill: 'none',
        stroke: 'white',
        'stroke-width': '2px',
      }
    )
    axis.redraw({
      x: {
        autoScale: true,
      },
      y: {
        autoScale: true,
      },
    })
    axis.accept(warnings1)
  })
  .catch((error) => console.error(`Failed to create chart: ${error}`))

addListenerByClassName('theme-button', 'click', () =>
  document.documentElement.classList.toggle('dark')
)
