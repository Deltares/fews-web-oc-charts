import '../../src/scss/wb-charts.scss'
import '../shared/shared.css'
import './extent-filter.css'

import * as d3 from 'd3'
import {
  AxisType,
  CartesianAxes,
  ChartArea,
  ChartLine,
  ChartMarker,
  CurrentTime,
  MouseOver,
  ZoomHandler,
} from '../../src'
import { addListenerByClassName } from '../shared'

const container = document.getElementById('chart-container-1')
const axis = new CartesianAxes(container, null, null, {
  x: [{ type: AxisType.time, showGrid: true }],
  y: [
    { label: 'Precipitation', unit: 'mm', showGrid: true, defaultDomain: [0, 2], nice: true },
    {
      label: 'Precipitation Probability',
      unit: '%',
      showGrid: false,
      defaultDomain: [0, 100],
      position: 'right',
      nice: false,
    },
  ],
  margin: { left: 50, right: 50 },
})

const mouseOver = new MouseOver([
  'precipitationContour',
  'precipitationProbability',
  'precipitation',
])
const zoom = new ZoomHandler()
const currentTime = new CurrentTime({ x: { axisIndex: 0 } })

function dataload() {
  d3.json('./open-meteo-outliers.json')
    .then(function (data) {
      const precipitation = []
      const precipitationProbability = []
      const precipitationProbabilityArea = []

      data.hourly.time.forEach(function (t, i) {
        const dateTime = new Date(t)
        precipitation.push({ x: dateTime, y: data.hourly.precipitation[i] })
        precipitationProbability.push({ x: dateTime, y: data.hourly.precipitation_probability[i] })
        precipitationProbabilityArea.push({
          x: dateTime,
          y: [0, data.hourly.precipitation_probability[i]],
        })
      })

      const extentFilter = (d) => {
        return d.y !== 999
      }

      const plotPrecipitation = new ChartArea(precipitation, {
        curve: 'stepBefore',
        y: { extentFilter },
      })
      const plotPrecipitationContour = new ChartMarker(precipitation, {
        tooltip: { alignment: 'right' },
        y: { extentFilter },
      })
      const plotPrecipitationProbability = new ChartLine(precipitationProbability, {
        y: { extentFilter },
      })

      plotPrecipitationProbability.addTo(
        axis,
        { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 1 } },
        'precipitationProbability',
        { fill: 'none', stroke: 'rgb(44, 175, 254)' }
      )

      plotPrecipitation.addTo(
        axis,
        { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
        'precipitation',
        { fill: 'rgba(84, 79, 197, .2)', stroke: 'none' }
      )

      plotPrecipitationContour.addTo(
        axis,
        { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
        'precipitationContour',
        { fill: 'none', stroke: 'currentColor' }
      )

      axis.accept(currentTime)
      axis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
      axis.zoom()
      axis.accept(zoom)
      axis.accept(mouseOver)
    })
    .catch((error) => console.error(`Failed to create chart: ${error}`))
}
window.setTimeout(dataload, 1)

function toggleFilterByIds(ids, active) {
  const extentFilter = (d) => {
    return d.y !== 999
  }

  if (active) {
    for (const chart of axis.charts) {
      if (ids.includes(chart.id)) {
        chart.setOptions({ y: { extentFilter } })
      }
    }
  } else {
    for (const chart of axis.charts) {
      if (ids.includes(chart.id)) {
        chart.setOptions({ y: { extentFilter: () => true } })
      }
    }
  }
  axis.redraw({ y: { autoScale: true } })
}

function toggleFilter(element) {
  if (element.dataset.filter === 'true') {
    element.dataset.filter = 'false'
  } else {
    element.dataset.filter = 'true'
  }
  const ids = element.getAttribute('data-id').split(',')
  toggleFilterByIds(ids, element.dataset.filter === 'true')
}

addListenerByClassName('theme-button', 'click', () =>
  document.documentElement.classList.toggle('dark')
)
addListenerByClassName('extent-filter', 'click', (event) => toggleFilter(event.target))
