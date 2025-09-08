import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './update-chart.css'

import {
  AxisPosition,
  CartesianAxes,
  ChartLine,
  MouseOver,
  ZoomHandler,
  PolarAxes,
  Direction,
  ChartArrow,
  Legend,
  AxisType,
  TooltipAnchor,
  ChartArrowData,
} from '@lib'
import { addListenerById } from '@shared'

interface DataEntry {
  t: Date
  y: number
}

function onLoad() {
  function createData(): DataEntry[] {
    const currentTime = new Date()
    const timeStep = 5 * 60 * 60 * 1000 // 5 minutes
    const windDirData = [
      {
        t: new Date(currentTime.getTime() - timeStep),
        y: 360 * Math.random(),
      },
      {
        t: currentTime,
        y: 360 * Math.random(),
      },
      {
        t: new Date(currentTime.getTime() + timeStep),
        y: 360 * Math.random(),
      },
    ]
    return windDirData
  }

  // Create wind direction chart
  const defaultYDomain: [number, number] = [0, 360]
  const chartContainer = document.getElementById('chart-wind-direction-time')
  const windDirAxis = new CartesianAxes(chartContainer, null, null, {
    x: [
      {
        type: AxisType.time,
        position: AxisPosition.Bottom,
        showGrid: true,
      },
    ],
    y: [
      {
        label: 'windrichting',
        unit: '°',
        type: AxisType.degrees,
        domain: defaultYDomain,
        defaultDomain: defaultYDomain,
        position: AxisPosition.Left,
        showGrid: true,
        nice: true,
      },
    ],
    margin: {
      left: 50,
      right: 50,
    },
  })

  // Create wind rose
  const containerWindrose = document.getElementById('chart-wind-rose')
  const windRoseAxis = new PolarAxes(containerWindrose, null, null, {
    angular: {
      direction: Direction.CLOCKWISE,
      intercept: Math.PI / 2,
      format: (value) => `${value}°`,
    },
    innerRadius: 0.5,
  })

  // Create data and add to chart and windrose
  let windDirObservedData = createData()
  const windDirObsChartLine = new ChartLine(windDirObservedData, {})
  windDirObsChartLine.addTo(
    windDirAxis,
    { x: { key: 't', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
    'winddirection',
    '#winddirection-line-time',
  )

  let windDirModelData = createData()
  const windDirModelChart = new ChartLine(windDirModelData, {})
  windDirModelChart.addTo(
    windDirAxis,
    { x: { key: 't', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
    'winddirection-forecast',
    '#winddirection-forecast-line-time',
  )

  function cartesianDataToArrowData(data: DataEntry[]): ChartArrowData[] {
    const input = document.getElementById('slider') as HTMLInputElement
    return [
      {
        x: [1, 0],
        y: [data[input.value].y, data[input.value].y],
      },
    ]
  }

  const windDirObsChartArrow = new ChartArrow(cartesianDataToArrowData(windDirObservedData), {
    transitionTime: null,
    symbol: { size: 64 },
    radial: { includeInTooltip: false },
    tooltip: { anchor: TooltipAnchor.Pointer },
  })
  windDirObsChartArrow.addTo(
    windRoseAxis,
    { radial: { key: 'x', axisIndex: 0 }, angular: { key: 'y', axisIndex: 0 } },
    'direction-measured',
    '#polar-line',
  )

  const windDirModelChartArrow = new ChartArrow(cartesianDataToArrowData(windDirModelData), {
    transitionTime: null,
    symbol: { size: 64 },
    radial: { includeInTooltip: false },
    tooltip: { anchor: TooltipAnchor.Pointer },
  })
  windDirModelChartArrow.addTo(
    windRoseAxis,
    { radial: { key: 'x', axisIndex: 0 }, angular: { key: 'y', axisIndex: 0 } },
    'direction-forecast',
    '#polar-line-forecast',
  )

  // Create legend and other visitors
  const legendWindDirection = new Legend(
    [
      { selector: 'winddirection', label: 'Windrichting meting' },
      { selector: 'winddirection-forecast', label: 'Windrichting model' },
    ],
    document.getElementById('legend-wind-direction-time'),
  )
  const legendWindRose = new Legend(
    [
      { selector: 'direction-measured', label: 'Windrichting meting' },
      { selector: 'direction-forecast', label: 'Windrichting verwachting' },
    ],
    document.getElementById('legend-wind-rose'),
  )

  const mouseOver = new MouseOver(['winddirection', 'winddirection-forecast'])
  const zoom = new ZoomHandler()
  // Draw chart and add visitors
  windDirAxis.accept(zoom)
  windDirAxis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
  windDirAxis.accept(mouseOver)
  windDirAxis.accept(legendWindDirection)

  windRoseAxis.redraw()
  windRoseAxis.accept(legendWindRose)

  function updateData() {
    // New data
    windDirObservedData = createData()
    windDirModelData = createData()

    // Update the line chart
    windDirObsChartLine.data = windDirObservedData
    windDirModelChart.data = windDirModelData
    windDirAxis.redraw({
      x: {
        nice: false,
        domain: undefined,
      },
      y: {
        nice: false,
        domain: undefined,
      },
    })

    // Update the windrose
    windDirObsChartArrow.data = cartesianDataToArrowData(windDirObservedData)
    windDirModelChartArrow.data = cartesianDataToArrowData(windDirModelData)
    windRoseAxis.redraw()
  }

  addListenerById('update-data-button', 'click', () => updateData())
  const input = document.getElementById('slider') as HTMLInputElement
  input.onchange = function () {
    windDirObsChartArrow.data = cartesianDataToArrowData(windDirObservedData)
    windDirModelChartArrow.data = cartesianDataToArrowData(windDirModelData)
    windRoseAxis.redraw()
  }

  addListenerById('btn-zoom-reset', 'click', () => {
    windDirAxis.redraw({ x: { autoScale: true }, y: { autoScale: true, nice: true } })
  })
  addListenerById('btn-zoom-full', 'click', () => {
    windDirAxis.redraw({ x: { autoScale: true }, y: { fullExtent: true, nice: true } })
  })
  addListenerById('btn-zoom-y', 'click', () => {
    windDirAxis.redraw({ x: { autoScale: true }, y: { domain: defaultYDomain, nice: true } })
  })
  addListenerById('btn-zoom-domain', 'click', () => {
    windDirAxis.redraw({ x: { autoScale: true }, y: { domain: [-50, 180], nice: false } })
  })
}

window.addEventListener('load', onLoad)
