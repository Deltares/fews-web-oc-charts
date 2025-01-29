import '../../src/scss/wb-charts.scss'
import '../shared.css'
import './escalation-levels.css'

import * as d3 from 'd3'
import {
  AxisPosition,
  AxisType,
  CartesianAxes,
  ChartArea,
  ChartLine,
  Legend,
  MouseOver,
  WarningLevels,
  ZoomHandler,
} from '../../src'
import { addListenerByClassName, percentile } from '../shared'

const axisOptions = {
  x: [
    {
      type: AxisType.time,
      label: 'datum',
      position: AxisPosition.Bottom,
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
}

const chartOptions = {
  x: {
    key: 'x',
    axisIndex: 0,
  },
  y: {
    key: 'y',
    axisIndex: 0,
  },
}

const chartOptionLevels = {
  x: {
    key: 'date',
    axisIndex: 0,
  },
  y: {
    key: 'value',
    axisIndex: 0,
  },
}

const legendLabels = [
  {
    selector: 'median',
    label: 'Middelste (P50)',
  },
  {
    selector: 'control',
    label: 'Controle',
  },
  {
    selector: 'percent90',
    label: '90% interval',
  },
  {
    selector: 'percent50',
    label: '50% interval',
  },
]

const container1 = document.getElementById('chart-waterlevel-1')
const axis1 = new CartesianAxes(container1, null, null, axisOptions)
const legend1 = new Legend(legendLabels, document.getElementById('legend-waterlevel-1'))

const axisOptions2 = {
  x: [
    {
      type: AxisType.time,
      label: 'datum',
      position: AxisPosition.Bottom,
      showGrid: false,
    },
  ],
  y: [
    {
      position: AxisPosition.Left,
      showGrid: true,
      nice: true,
      includeZero: true,
      reverse: true,
      label: 'Waterstand',
      unit: 'cm',
    },
  ],
  margin: {
    left: 100,
    right: 100,
  },
}

const container2 = document.getElementById('chart-waterlevel-2')
const axis2 = new CartesianAxes(container2, null, null, axisOptions2)
const legend2 = new Legend(legendLabels, document.getElementById('legend-waterlevel-2'))

const container3 = document.getElementById('chart-waterlevel-3')
const axis3 = new CartesianAxes(container3, null, null, axisOptions)
const legend3 = new Legend(legendLabels, document.getElementById('legend-waterlevel-3'))

function getRoundedDate(minutes, d = new Date()) {
  const ms = 1000 * 60 * minutes // convert minutes to ms
  const roundedDate = new Date(Math.round(d.getTime() / ms) * ms)
  return roundedDate
}

const refDate = getRoundedDate(10, new Date())

const escalationLevels1 = [
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

const escalationLevels2 = [
  {
    id: 'bruin',
    events: [],
    levelStart: -50,
    levelEnd: -100,
    color: 'rgba(205, 133, 63,.5)',
    c: '<',
  },
  {
    id: 'groen',
    events: [],
    levelStart: null,
    levelEnd: null,
    color: 'rgba(164,237,18,.5)',
    c: '<',
  },
  {
    id: 'geel',
    events: [],
    levelStart: 40,
    levelEnd: 70,
    color: 'rgba(255, 215, 0,.5)',
    c: '>',
  },
  {
    id: 'oranje',
    events: [],
    levelStart: 130,
    levelEnd: 160,
    color: 'rgba(255, 150, 0,.5)',
    c: '>',
  },
  {
    id: 'rood',
    events: [],
    levelStart: 180,
    levelEnd: 210,
    color: 'rgba(255, 0, 0,.5)',
    c: '>',
  },
]

const escalationLevels3 = [
  // Only higher levels
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

const plot1 = {
  axis: axis1,
  escalations: escalationLevels1,
}
const plot2 = {
  axis: axis2,
  escalations: escalationLevels2,
}
const plot3 = {
  axis: axis3,
  escalations: escalationLevels3,
}

axis1.accept(legend1)
axis2.accept(legend2)
axis3.accept(legend3)

function dataload(plot) {
  d3.json('../data/ensemble.json')
    .then(function (data) {
      // load data
      const nEnsemble = data.values[0].length
      const members = Array(nEnsemble)
      const percentiles = [[], [], []]

      for (let s = 0; s < nEnsemble; s++) {
        members[s] = []
      }
      const medianTime = (data.times[0] + data.times[data.times.length - 1]) / 2

      data.times.forEach(function (time, index) {
        const dateTime = new Date((time - medianTime) * 1000 + refDate.getTime())
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

        plot.escalations.forEach(function (el, i) {
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

      // Plot
      const mouseOver = new MouseOver(['control', 'median', 'percent90'])
      const zoom = new ZoomHandler()

      const plotMedian = new ChartLine(percentiles[0], {})
      const plotControl = new ChartLine(members[0], {})

      const plotPercentile50 = new ChartArea(percentiles[1], {})
      const plotPercentile90 = new ChartArea(percentiles[2], {})

      const escalationsVisitor = new WarningLevels(plot.escalations, {})

      plot.escalations.forEach(function (el, i) {
        const escLevel = new ChartLine(el.events, { curve: 'stepAfter' })
        escLevel.addTo(plot.axis, chartOptionLevels, el.id, {
          fill: 'none',
          stroke: el.color,
          'stroke-width': '2px',
          'stroke-dasharray': '4, 2',
        })
      })

      plotPercentile90.addTo(plot.axis, chartOptions, 'percent90', '#perc90')
      plotPercentile50.addTo(plot.axis, chartOptions, 'percent50', '#perc50')
      plotControl.addTo(plot.axis, chartOptions, 'control', '#control-line')
      plotMedian.addTo(plot.axis, chartOptions, 'median', '#median-line')
      plot.axis.accept(escalationsVisitor)
      plot.axis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
      plot.axis.zoom()
      plot.axis.accept(mouseOver)
      plot.axis.accept(zoom)
    })
    .catch((error) => console.error(`Failed to create chart: ${error}`))
}
for (const plot of [plot1, plot2, plot3]) {
  dataload(plot)
}

addListenerByClassName('theme-button', 'click', () =>
  document.documentElement.classList.toggle('dark')
)
