import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './zoom-options.css'

import * as d3 from 'd3'
import {
  AxisPosition,
  AxisType,
  CartesianAxes,
  CartesianAxesOptions,
  CartesianAxisOptions,
  ChartArea,
  ChartLine,
  Legend,
  MouseOver,
  ResetZoom,
  WarningLevels,
  ZoomHandler,
} from '@lib'
import { addListenerByClassName, addListenerById, percentile } from '@shared'

const defaultYDomain1: [number, number] = [-100, 100]
const defaultYDomain2: [number, number] = [50, 150]
const defaultYDomain3: [number, number] = [50, 150]
const defaultYDomain4: [number, number] = [50, 150]
const xAxisOptions: CartesianAxisOptions = {
  type: AxisType.time,
  label: 'datum',
  position: AxisPosition.Bottom,
  showGrid: false,
}
const yAxisOptions: CartesianAxisOptions = {
  position: AxisPosition.Left,
  label: 'Waterstand',
  unit: 'cm',
  nice: true,
  showGrid: true,
}
const marginAxisOptions = {
  left: 100,
  right: 100,
}
const axisOptions1: CartesianAxesOptions = {
  x: [xAxisOptions],
  y: [{ ...yAxisOptions, ...{ defaultDomain: defaultYDomain1, resetZoom: ResetZoom.toggle } }],
  margin: marginAxisOptions,
}
const axisOptions2: CartesianAxesOptions = {
  x: [xAxisOptions],
  y: [{ ...yAxisOptions, ...{ defaultDomain: defaultYDomain2 } }],
  margin: marginAxisOptions,
}
const axisOptions3: CartesianAxesOptions = {
  x: [xAxisOptions],
  y: [
    {
      ...yAxisOptions,
      ...{ includeZero: true, defaultDomain: defaultYDomain3, resetZoom: ResetZoom.full },
    },
  ],
  margin: marginAxisOptions,
}
const axisOptions4: CartesianAxesOptions = {
  x: [xAxisOptions],
  y: [{ ...yAxisOptions, ...{ includeZero: true, defaultDomain: defaultYDomain4 } }],
  margin: marginAxisOptions,
}

const chartOptions = {
  x: {
    key: 'time',
    axisIndex: 0,
  },
  y: {
    key: 'value',
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

const container1 = document.getElementById('chart-waterlevel1')
const axis1 = new CartesianAxes(container1, null, null, axisOptions1)
const legend1 = new Legend(legendLabels, document.getElementById('legend-waterlevel1'))

const container2 = document.getElementById('chart-waterlevel2')
const axis2 = new CartesianAxes(container2, null, null, axisOptions2)
const legend2 = new Legend(legendLabels, document.getElementById('legend-waterlevel2'))

const container3 = document.getElementById('chart-waterlevel3')
const axis3 = new CartesianAxes(container3, null, null, axisOptions3)
const legend3 = new Legend(legendLabels, document.getElementById('legend-waterlevel3'))

const container4 = document.getElementById('chart-waterlevel4')
const axis4 = new CartesianAxes(container4, null, null, axisOptions4)
const legend4 = new Legend(
  [legendLabels[2], legendLabels[3]],
  document.getElementById('legend-waterlevel4')
)

function getRoundedDate(minutes, d = new Date()) {
  const ms = 1000 * 60 * minutes // convert minutes to ms
  const roundedDate = new Date(Math.round(d.getTime() / ms) * ms)
  return roundedDate
}

const refDate = getRoundedDate(10, new Date())
const escalationLevels = [
  {
    id: 'laag',
    events: [],
    levelStart: -220,
    levelEnd: -150,
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
    levelStart: 200,
    levelEnd: 250,
    color: 'rgba(255, 0, 0,.5)',
    c: '>',
  },
]

const plot1 = {
  axis: axis1,
  escalations: escalationLevels,
  positiveData: false,
  onlyRanges: false,
}
axis1.accept(legend1)

const plot2 = {
  axis: axis2,
  escalations: escalationLevels,
  positiveData: true,
  onlyRanges: false,
}
axis2.accept(legend2)

const plot3 = {
  axis: axis3,
  escalations: escalationLevels,
  positiveData: true,
  onlyRanges: false,
}
axis3.accept(legend3)

const plot4 = {
  axis: axis4,
  escalations: escalationLevels,
  positiveData: true,
  onlyRanges: true,
}
axis4.accept(legend4)

function dataload(plot) {
  d3.json('../data/ensemble.json')
    .then(function (data) {
      // load data
      const nEnsemble = data.values[0].length
      const members = Array(nEnsemble)
      const percentiles = [[], [], []]
      const offset = plot.positiveData ? 150 : 0

      for (let s = 0; s < nEnsemble; s++) {
        members[s] = []
      }
      const medianTime = (data.times[0] + data.times[data.times.length - 1]) / 2
      plot.escalations.forEach(function (el, i) {
        el.events = []
      })

      data.times.forEach(function (time, index) {
        const dateTime = new Date((time - medianTime) * 1000 + refDate.getTime())
        for (let i = 0; i < nEnsemble; i++) {
          members[i].push({
            [chartOptions.x.key]: dateTime,
            [chartOptions.y.key]: data.values[index][i] + offset,
          })
        }
        const points = data.values[index]
        if (!plot.onlyRanges) {
          percentiles[0].push({
            [chartOptions.x.key]: dateTime,
            [chartOptions.y.key]: percentile(0.5, points) + offset,
          })
        }
        const perc50 = percentile([0.25, 0.75], points)
        percentiles[1].push({
          [chartOptions.x.key]: dateTime,
          [chartOptions.y.key]: [perc50[0] + offset, perc50[1] + offset],
        })
        const perc90 = percentile([0.05, 0.95], points)
        percentiles[2].push({
          [chartOptions.x.key]: dateTime,
          [chartOptions.y.key]: [perc90[0] + offset, perc90[1] + offset],
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

      let plotMedian
      let plotControl
      if (!plot.onlyRanges) {
        plotMedian = new ChartLine(percentiles[0], {})
        plotControl = new ChartLine(members[0], {})
      }
      const plotPercentile50 = new ChartArea(percentiles[1], {})
      const plotPercentile90 = new ChartArea(percentiles[2], {})

      plotPercentile90.addTo(plot.axis, chartOptions, 'percent90', '#perc90')
      plotPercentile50.addTo(plot.axis, chartOptions, 'percent50', '#perc50')
      if (!plot.onlyRanges) {
        plotControl.addTo(plot.axis, chartOptions, 'control', '#control-line')
        plotMedian.addTo(plot.axis, chartOptions, 'median', '#median-line')
      }

      const escalationsVisitor = new WarningLevels(plot.escalations, {})
      plot.axis.accept(escalationsVisitor)
      plot.escalations.forEach(function (el, i) {
        const escLevel = new ChartLine(el.events, {
          curve: 'stepAfter',
          y: { includeInAutoScale: false },
        })
        escLevel.addTo(plot.axis, chartOptionLevels, el.id, {
          fill: 'none',
          stroke: el.color,
          'stroke-width': '2px',
          'stroke-dasharray': '4, 2',
        })
      })

      if (!plot.onlyRanges) {
        plot.axis.accept(mouseOver)
      }
      plot.axis.accept(zoom)
      plot.axis.redraw({ x: { autoScale: true }, y: { autoScale: true, nice: true } })

      plot.axis.zoom()
    })
    .catch((error) => console.error(`Failed to create chart: ${error}`))
}

dataload(plot1)
dataload(plot2)
dataload(plot3)
dataload(plot4)

addListenerById('btn-reset-1', 'click', () => {
  restoreZoom(plot1)
})
addListenerById('btn-reset-2', 'click', () => {
  restoreZoom(plot2)
})
addListenerById('btn-reset-3', 'click', () => {
  restoreZoom(plot3)
})
addListenerById('btn-reset-4', 'click', () => {
  restoreZoom(plot4)
})

function restoreZoom(plot) {
  plot.axis.redraw({ x: { autoScale: true }, y: { autoScale: true, nice: true } })
}

addListenerById('btn-zoom-full-1', 'click', () => {
  zoomToFullExtent(plot1)
})
addListenerById('btn-zoom-full-2', 'click', () => {
  zoomToFullExtent(plot2)
})
addListenerById('btn-zoom-full-3', 'click', () => {
  zoomToFullExtent(plot3)
})
addListenerById('btn-zoom-full-4', 'click', () => {
  zoomToFullExtent(plot4)
})

function zoomToFullExtent(plot) {
  plot.axis.redraw({ x: { autoScale: true }, y: { fullExtent: true, nice: true } })
}

addListenerById('btn-zoom-y-1', 'click', () => {
  zoomToYDefault(plot1, defaultYDomain1)
})
addListenerById('btn-zoom-y-2', 'click', () => {
  zoomToYDefault(plot2, defaultYDomain2)
})
addListenerById('btn-zoom-y-3', 'click', () => {
  zoomToYDefault(plot3, defaultYDomain3)
})
addListenerById('btn-zoom-y-4', 'click', () => {
  zoomToYDefault(plot4, defaultYDomain4)
})

function zoomToYDefault(plot, defaultYDomain) {
  plot.axis.redraw({ x: { autoScale: true }, y: { domain: defaultYDomain, nice: true } })
}

addListenerById('btn-zoom-domain-1', 'click', () => {
  zoomToDomain(plot1)
})
addListenerById('btn-zoom-domain-2', 'click', () => {
  zoomToDomain(plot2)
})
addListenerById('btn-zoom-domain-3', 'click', () => {
  zoomToDomain(plot3)
})
addListenerById('btn-zoom-domain-4', 'click', () => {
  zoomToDomain(plot4)
})

function zoomToDomain(plot) {
  plot.axis.redraw({ x: { autoScale: true }, y: { domain: [-350, 480], nice: false } })
}

addListenerByClassName('theme-button', 'click', () =>
  document.documentElement.classList.toggle('dark')
)
