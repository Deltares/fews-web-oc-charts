import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './windrose-wbviewer.css'

import {
  AxisType,
  BeaufortAxis,
  CartesianAxes,
  ChartArrow,
  ChartLine,
  ChartRange,
  CurrentTime,
  DataField,
  dateFormatter,
  Direction,
  Legend,
  MouseOver,
  PolarAxes,
  scaleBeaufort,
  scaleWindCategories,
  TooltipAnchor,
  ZoomHandler,
} from '@lib'
import { addListenerByClassName, addListenerById } from '@shared'

import * as d3 from 'd3'

d3.timeFormatDefaultLocale({
  dateTime: '%a %e %B %Y %T',
  date: '%d-%m-%Y',
  time: '%H:%M:%S',
  periods: ['AM', 'PM'],
  days: ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'],
  shortDays: ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'],
  months: [
    'januari',
    'februari',
    'maart',
    'april',
    'mei',
    'juni',
    'juli',
    'augustus',
    'september',
    'oktober',
    'november',
    'december',
  ],
  shortMonths: ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'],
})

let polarAxis
let windSpeedAxis
let windStootAxis
let windTimeAxis
let windDirectionTimeAxis

let windDirectionMeasurement
let windDirectionForecast
let windSpeedMeasurement
let windSpeedForecast
let windDirectionRange
let windSpeedRange
let windStootChart
let polarText
let polarText1
let polarText2
let windStootText
let windAmplitudeText
let legendWindTime

let beaufortVisitor
let beaufortVisitor1

let windSpeedTimeM
let windSpeedTimeF
let windStootTimeM
let windDirectionTimeM
let windDirectionTimeF

let timesdata

addListenerById('slider-reset-button', 'click', () => resetTimeSlider(timesdata, true))

const transitionTime = null

function resetTimeSlider(times, force) {
  const sliderreset = document.getElementById('slider-reset') as HTMLInputElement
  if (!force && !sliderreset.checked) {
    return
  }
  const slider = document.getElementById('slider') as HTMLInputElement
  slider.max = (times.length - 1).toString()
  const now = Math.floor(Date.now() / 1000)
  let t = 0
  for (t = 0; t < times.length; t++) {
    if (times[t][0] > now) {
      break
    }
  }
  if (t > 0) {
    t--
  }
  for (; t >= 0; t--) {
    if (times[t][1]) {
      break
    }
  }
  slider.value = t.toString()
  slider.dispatchEvent(new Event('change'))
}

function speedDataFormatter(d) {
  if (!d[0] || d[0].x === null) {
    return '-' + 'm/s\t' + '-' + 'kt\t' + '-' + 'km/h'
  }
  const format = d3.format('.1f')
  const value = d[0].y !== null ? format(d[0].y) : '-'
  const knots = d[0].y !== null ? format(d[0].y * 1.943844) : '-'
  const kmph = d[0].y !== null ? format(d[0].y * 3.6) : '-'
  return value + 'm/s\t' + knots + 'kt\t' + kmph + 'km/h'
}

const unitsSpeed = [
  { unit: ' m/s', factor: 1.0 },
  { unit: ' kt', factor: 1.943844 },
  { unit: ' km/h', factor: 3.6 },
  { unit: ' Bft', scale: scaleBeaufort },
]
const unitsStoot = [
  { unit: ' m/s', factor: 1.0 },
  { unit: ' kt', factor: 1.943844 },
  { unit: ' km/h', factor: 3.6 },
]
const degree = [
  { unit: '°', factor: 1.0, precision: '.0f' },
  { unit: '', scale: scaleWindCategories },
]

function setupWindrose(
  windRichtingMetingen,
  windRichtingVerwachtingen,
  windSnelheiMetingen,
  windSnelheiVerwachtingen,
  allWindSpreidingR,
  allWindSpreidingV,
  allWindStoot,
  times,
) {
  // Wind rose chart
  const containerWindrose = document.getElementById('chart-wind-rose')
  polarAxis = new PolarAxes(containerWindrose, null, null, {
    angular: {
      direction: Direction.CLOCKWISE,
      intercept: Math.PI / 2,
      format: (value) => `${value}°`,
    },
    innerRadius: 0.5,
  })
  windDirectionMeasurement = new ChartArrow(windRichtingMetingen[0], {
    transitionTime: transitionTime,
    symbol: { size: 64 },
    radial: { includeInTooltip: false },
    tooltip: { anchor: TooltipAnchor.Pointer },
  })
  windDirectionForecast = new ChartArrow(windRichtingVerwachtingen[0], {
    transitionTime: transitionTime,
    symbol: { size: 64 },
    radial: { includeInTooltip: false },
    tooltip: { anchor: TooltipAnchor.Pointer },
  })
  windDirectionRange = new ChartRange(allWindSpreidingR[0], {
    transitionTime: transitionTime,
    radial: { includeInTooltip: false },
    tooltip: { anchor: TooltipAnchor.Center },
  })
  windDirectionRange.addTo(
    polarAxis,
    { radial: { key: 'x' }, angular: { key: 'y' } },
    'direction-range',
    '#polar-range',
  )
  windDirectionMeasurement.addTo(
    polarAxis,
    { radial: { key: 'x' }, angular: { key: 'y' } },
    'direction-measured',
    '#polar-line',
  )
  windDirectionForecast.addTo(
    polarAxis,
    { radial: { key: 'x' }, angular: { key: 'y' } },
    'direction-forecast',
    '#polar-line-forecast',
  )

  polarText = new DataField(polarAxis.canvas, {
    selector: 'direction-measured',
    labelField: { text: 'richting' },
    valueField: { units: degree },
  })

  polarText1 = new DataField(polarAxis.canvas, {
    selector: ['wind-forecast', 'wind'],
    labelField: { text: 'windsnelheid' },
    valueField: { hyphen: ' / ', units: unitsSpeed },
  })

  polarText2 = new DataField(polarAxis.canvas, {
    selector: 'stoot',
    labelField: { text: 'windstoot' },
    valueField: { units: unitsStoot },
  })

  const legendWindRose = new Legend(
    [
      { selector: 'direction-range', label: 'Windrichting spreiding' },
      { selector: 'direction-measured', label: 'Windrichting meting' },
      { selector: 'direction-forecast', label: 'Windrichting verwachting' },
    ],
    document.getElementById('legend-wind-rose'),
  )

  // Wind speed chart
  beaufortVisitor = new BeaufortAxis({
    x: { axisIndex: 0 },
    colors: {
      1: 'rgba(255, 255, 255, 0.2)',
      3: 'rgba(255, 255, 255, 0.2)',
      5: 'rgba(255, 255, 255, 0.2)',
      7: 'rgba(255, 255, 255, 0.2)',
      9: 'rgba(255, 255, 255, 0.2)',
      11: 'rgba(255, 255, 255, 0.2)',
    },
  })

  const containerWindSpeed = document.getElementById('chart-wind-speed')
  windSpeedAxis = new CartesianAxes(containerWindSpeed, null, null, {
    transitionTime: transitionTime,
    x: [
      {
        unit: 'm/s',
        domain: [0, 40],
        position: 'bottom',
        showGrid: true,
      },
      {
        position: 'top',
        unit: 'Bft',
      },
    ],
    y: [{ position: 'left' }],
    margin: {
      right: 60,
      left: 60,
      bottom: 60,
    },
  })

  windSpeedRange = new ChartRange(allWindSpreidingV[0], {
    transitionTime: transitionTime,
    y: { includeInTooltip: false },
    tooltip: { anchor: TooltipAnchor.Center },
  })
  windSpeedMeasurement = new ChartLine(windSnelheiMetingen[0], {
    transitionTime: transitionTime,
    y: { includeInTooltip: false },
    tooltip: { anchor: TooltipAnchor.Pointer },
  })
  windSpeedForecast = new ChartLine(windSnelheiVerwachtingen[0], {
    transitionTime: transitionTime,
    y: { includeInTooltip: false },
    tooltip: { anchor: TooltipAnchor.Pointer },
  })

  windSpeedRange.addTo(
    windSpeedAxis,
    { x: { key: 'y', axisIndex: 0 }, y: { key: 'x', axisIndex: 0 } },
    'cartesian-range',
    '#cartesian-range',
  )
  windSpeedMeasurement.addTo(
    windSpeedAxis,
    { x: { key: 'y', axisIndex: 0 }, y: { key: 'x', axisIndex: 0 } },
    'wind',
    '#wind-line',
  )
  windSpeedForecast.addTo(
    windSpeedAxis,
    { x: { key: 'y', axisIndex: 0 }, y: { key: 'x', axisIndex: 0 } },
    'wind-forecast',
    '#wind-forecast-line',
  )

  windAmplitudeText = new DataField(
    windSpeedAxis.canvas,
    {
      selector: 'wind',
      labelField: { text: 'windsnelheid' },
    },
    speedDataFormatter,
  )

  // Wind stoot chart
  const containerWindstoot = document.getElementById('chart-wind-stoot')
  windStootAxis = new CartesianAxes(containerWindstoot, null, null, {
    transitionTime: transitionTime,
    x: [
      {
        unit: 'm/s',
        domain: [0, 40],
        position: 'bottom',
        showGrid: true,
      },
    ],
    margin: {
      right: 60,
      left: 60,
      bottom: 60,
    },
    y: [],
  })
  windStootChart = new ChartLine(allWindStoot[0], {
    transitionTime: transitionTime,
    y: { includeInTooltip: false },
    tooltip: { anchor: 'default' },
  })
  windStootChart.addTo(
    windStootAxis,
    { x: { key: 'y', axisIndex: 0 }, y: { key: 'x', axisIndex: 0 } },
    'stoot',
    '#stoot-line',
  )

  windStootText = new DataField(
    windStootAxis.canvas,
    {
      selector: 'stoot',
      labelField: { text: 'windstoot' },
    },
    speedDataFormatter,
  )

  // Time chart wind speed
  beaufortVisitor1 = new BeaufortAxis({
    y: { axisIndex: 0 },
    colors: {
      0: 'rgba(255, 255, 255, 0.2)',
      1: 'rgba(174, 241, 249, 0.2)',
      2: 'rgba(150, 247, 220, 0.2)',
      3: 'rgba(150, 247, 180, 0.2)',
      4: 'rgba(111, 244, 111, 0.2)',
      5: 'rgba(115, 237, 19, 0.2)',
      6: 'rgba(164, 237, 18, 0.2)',
      7: 'rgba(218, 237, 19, 0.2)',
      8: 'rgba(237, 194, 18, 0.2)',
      9: 'rgba(237, 143, 18, 0.2)',
      10: 'rgba(237, 99, 18, 0.2)',
      11: 'rgba(237, 41, 17, 0.2)',
      12: 'rgba(213, 16, 44, 0.2)',
    },
  })

  const containerWindSpeedTime = document.getElementById('chart-wind-speed-time')
  windTimeAxis = new CartesianAxes(containerWindSpeedTime, null, null, {
    transitionTime: transitionTime,
    x: [{ type: AxisType.time, position: 'bottom', showGrid: true }],
    y: [
      {
        label: 'windsnelheid',
        unit: 'm/s',
        domain: [0, 40],
        position: 'left',
        showGrid: true,
      },
      {
        position: 'right',
        unit: 'Bft',
      },
    ],
    margin: {
      right: 60,
      left: 60,
    },
  })
  windSpeedTimeM = new ChartLine(
    [
      { t: 0, y: 0 },
      { t: 1, y: 0 },
    ],
    { transitionTime: transitionTime },
  )
  windSpeedTimeF = new ChartLine(
    [
      { t: 0, y: 0 },
      { t: 1, y: 0 },
    ],
    { transitionTime: transitionTime },
  )
  windStootTimeM = new ChartLine(
    [
      { t: 0, y: 0 },
      { t: 1, y: 0 },
    ],
    { transitionTime: transitionTime },
  )

  windSpeedTimeM.addTo(
    windTimeAxis,
    { x: { key: 't', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
    'wind',
    '#wind-line-time',
  )

  windStootTimeM.addTo(
    windTimeAxis,
    { x: { key: 't', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
    'windstoot',
    '#windstoot-line-time',
  )
  //
  windSpeedTimeF.addTo(
    windTimeAxis,
    { x: { key: 't', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
    'wind-forecast',
    '#wind-forecast-line-time',
  )

  legendWindTime = new Legend(
    [
      { selector: 'windstoot', label: 'Windstoot meting' },
      { selector: 'wind', label: 'Windsnelheid meting' },
      { selector: 'wind-forecast', label: 'Windsnelheid verwachting' },
    ],
    document.getElementById('legend-wind-speed-time'),
  )
  // Time chart wind direction
  const containerWindDirectionTme = document.getElementById('chart-wind-direction-time')
  windDirectionTimeAxis = new CartesianAxes(containerWindDirectionTme, null, null, {
    transitionTime: transitionTime,
    x: [{ type: AxisType.time, position: 'bottom', showGrid: true }],
    y: [
      {
        label: 'windrichting',
        unit: '°',
        type: AxisType.degrees,
        domain: [0, 360],
        position: 'left',
        showGrid: true,
      },
    ],
    margin: {
      right: 60,
      left: 60,
    },
  })
  windDirectionTimeM = new ChartLine(
    [
      { t: 0, y: 0 },
      { t: 1, y: 0 },
    ],
    { transitionTime: transitionTime },
  )
  windDirectionTimeF = new ChartLine(
    [
      { t: 0, y: 0 },
      { t: 1, y: 0 },
    ],
    { transitionTime: transitionTime },
  )
  windDirectionTimeM.addTo(
    windDirectionTimeAxis,
    { x: { key: 't', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
    'winddirection',
    '#winddirection-line-time',
  )
  windDirectionTimeF.addTo(
    windDirectionTimeAxis,
    { x: { key: 't', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
    'winddirection-forecast',
    '#winddirection-forecast-line-time',
  )

  const legendWindDirectionTime = new Legend(
    [
      { selector: 'winddirection', label: 'Windrichting meting' },
      { selector: 'winddirection-forecast', label: 'Windrichting verwachting' },
    ],
    document.getElementById('legend-wind-direction-time'),
  )

  // Draw
  windSpeedAxis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
  windStootAxis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
  polarAxis.redraw()
  windTimeAxis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
  windDirectionTimeAxis.redraw({ x: { autoScale: true }, y: { autoScale: true } })

  // Add visitors
  polarAxis.accept(polarText)
  polarAxis.accept(legendWindRose)
  windSpeedAxis.accept(polarText1)
  windSpeedAxis.accept(windAmplitudeText)
  windSpeedAxis.accept(beaufortVisitor)
  windStootAxis.accept(windStootText)
  windStootAxis.accept(polarText2)
  windTimeAxis.accept(legendWindTime)
  windTimeAxis.accept(beaufortVisitor1)

  windDirectionTimeAxis.accept(legendWindDirectionTime)
  windDirectionTimeAxis.accept(new ZoomHandler())
  windDirectionTimeAxis.accept(new CurrentTime({ x: { axisIndex: 0 } }))

  const sliderdt = document.getElementById('slider-datetime')
  sliderdt.innerHTML = dateFormatter(new Date(times[0] * 1000), 'yyyy-MM-DD HH:mm ZZZZ', {
    timeZone: 'Europe/Amsterdam',
  })
}

function updateChartWindTime(windSpeedTimeSeriesM, windSpeedTimeSeriesF, windStootTimeSeriesM) {
  windSpeedTimeM.data = windSpeedTimeSeriesM
  windSpeedTimeF.data = windSpeedTimeSeriesF
  windStootTimeM.data = windStootTimeSeriesM

  windTimeAxis.redraw({ x: { autoScale: true } })
  windTimeAxis.accept(new ZoomHandler())
  const mouseOverWindTime = new MouseOver(['windstoot', 'wind', 'wind-forecast'])
  windTimeAxis.accept(mouseOverWindTime)
  windTimeAxis.accept(new CurrentTime({ x: { axisIndex: 0 } }))
}

function updateChartWindDirectionTime(windDirectionTimeSeriesM, windDirectionTimeSeriesF) {
  windDirectionTimeM.data = windDirectionTimeSeriesM
  windDirectionTimeF.data = windDirectionTimeSeriesF
  windDirectionTimeAxis.redraw({ x: { autoScale: true } })

  const mouseOverWindDirectionTime = new MouseOver(['winddirection', 'winddirection-forecast'])
  windDirectionTimeAxis.accept(new ZoomHandler())
  windDirectionTimeAxis.accept(mouseOverWindDirectionTime)
  windDirectionTimeAxis.accept(new CurrentTime({ x: { axisIndex: 0 } }))
}

function updateWindrose(
  windRichtingMetingen,
  windRichtingVerwachtingen,
  windSnelheidMetingen,
  windSnelheidVerwachtingen,
  windSpreidingR,
  windSpreidingV,
  windStoot,
  times,
) {
  const updateCharts = function (event) {
    const position = event.target.value
    windDirectionMeasurement.data = windRichtingMetingen[position]
    windDirectionForecast.data = windRichtingVerwachtingen[position]
    windSpeedMeasurement.data = windSnelheidMetingen[position]
    windSpeedForecast.data = windSnelheidVerwachtingen[position]
    windDirectionRange.data = windSpreidingR[position]
    windSpeedRange.data = windSpreidingV[position]
    windStootChart.data = windStoot[position]

    polarAxis.redraw()
    windSpeedAxis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
    windStootAxis.redraw({ x: { autoScale: true }, y: { autoScale: true } })

    const sliderdt = document.getElementById('slider-datetime')
    sliderdt.innerHTML = dateFormatter(new Date(times[position] * 1000), 'yyyy-MM-DD HH:mm ZZZZ', {
      timeZone: 'Europe/Amsterdam',
    })
  }
  const input = document.getElementById('slider')
  input.onchange = function (event) {
    updateCharts(event)
  }
}

function get_wind_data() {
  const request = new XMLHttpRequest()
  request.onreadystatechange = function () {
    if (this.readyState == 4 && this.status == 200) {
      const data = JSON.parse(this.responseText)
      const metingvalues = data.meting.values
      const verwachtingvalues = data.verwachting.values
      const spreidingvalues = data.spreiding.values
      const times = data.meting.times
      timesdata = []

      const windSpeedTimeSeriesM = []
      const windDirectionTimeSeriesM = []
      const windStootTimeSeriesM = []
      for (let i = 0; i < data.meting.times.length; i++) {
        if (data.meting.values[i][0] || data.meting.values[i][2] || data.meting.values[i][3]) {
          const dateTime = new Date(data.meting.times[i] * 1000)
          let val = data.meting.values[i][2] !== null ? data.meting.values[i][2] * 0.1 : null
          windSpeedTimeSeriesM.push({ t: dateTime, y: val })
          windDirectionTimeSeriesM.push({ t: dateTime, y: data.meting.values[i][0] })
          val = data.meting.values[i][2] !== null ? data.meting.values[i][3] * 0.1 : null
          windStootTimeSeriesM.push({ t: dateTime, y: val })
        }
      }

      const windSpeedTimeSeriesF = []
      const windDirectionTimeSeriesF = []
      for (let i = 0; i < data.verwachting.times.length; i++) {
        if (data.verwachting.values[i][0] || data.verwachting.values[i][2]) {
          const dateTime = new Date(data.verwachting.times[i] * 1000)
          windSpeedTimeSeriesF.push({ t: dateTime, y: data.verwachting.values[i][0] * 0.1 })
          windDirectionTimeSeriesF.push({ t: dateTime, y: data.verwachting.values[i][1] })
        }
      }

      const allWindRichtingMetingen = []
      const allWindRichtingVerwachtingen = []
      const allWindSnelheidMetingen = []
      const allWindSnelheidVerwachtingen = []
      const allWindSpreidingR = []
      const allWindSpreidingV = []
      const allWindStoot = []
      for (let i = 0; i < times.length; i++) {
        const timedatapresent =
          metingvalues[i][0] !== null || metingvalues[i][2] !== null || metingvalues[i][3] !== null
        timesdata.push([times[i], timedatapresent])

        const metingRichtingData = {
          x: [metingvalues[i][0] !== null ? 1 : 0, 0],
          y: [metingvalues[i][0], metingvalues[i][0]],
        }
        allWindRichtingMetingen.push([metingRichtingData])

        const verwachtingRichtingData = {
          x: [verwachtingvalues[i][0] !== null ? 1 : 0, 0],
          y: [verwachtingvalues[i][1], verwachtingvalues[i][1]],
        }
        allWindRichtingVerwachtingen.push([verwachtingRichtingData])

        const metingSnelheidData1 = {}
        const metingSnelheidData2 = {}
        metingSnelheidData1.x = 0
        metingSnelheidData1.y =
          metingvalues[i][2] !== null ? Math.abs(0.1 * metingvalues[i][2]) : null // scale down by factor 10 for m/sec
        metingSnelheidData2.x = metingvalues[i][2] !== null ? 1 : 0
        metingSnelheidData2.y = metingSnelheidData1.y
        allWindSnelheidMetingen.push([metingSnelheidData1, metingSnelheidData2])

        const metingStootData1 = {}
        const metingstootData2 = {}
        metingStootData1.x = 0
        metingStootData1.y = metingvalues[i][3] !== null ? Math.abs(0.1 * metingvalues[i][3]) : null // scale down by factor 10 for m/sec
        metingstootData2.x = metingvalues[i][3] !== null ? 1 : 0
        metingstootData2.y = metingStootData1.y
        allWindStoot.push([metingStootData1, metingstootData2])

        const verwachtingSnelheidData1 = {}
        const verwachtingSnelheidData2 = {}
        verwachtingSnelheidData1.x = 0
        verwachtingSnelheidData1.y = Math.abs(0.1 * verwachtingvalues[i][0]) // scale down by factor 10 for m/sec
        verwachtingSnelheidData2.x = verwachtingvalues[i][0] !== null ? 1 : 0
        verwachtingSnelheidData2.y = Math.abs(0.1 * verwachtingvalues[i][0]) // scale down by factor 10 for m/sec
        allWindSnelheidVerwachtingen.push([verwachtingSnelheidData1, verwachtingSnelheidData2])

        const windSpreidingRData = {}
        windSpreidingRData.x = [0, 1]

        if (spreidingvalues[i][3] < spreidingvalues[i][2]) {
          if (spreidingvalues[i][3] < metingvalues[i][0]) {
            windSpreidingRData.y = [spreidingvalues[i][2], spreidingvalues[i][3] + 360]
          } else {
            windSpreidingRData.y = [spreidingvalues[i][2] - 360, spreidingvalues[i][3]]
          }
        } else {
          windSpreidingRData.y = [spreidingvalues[i][2], spreidingvalues[i][3]]
        }
        allWindSpreidingR.push([windSpreidingRData])

        const windSpreidingVData = {}
        windSpreidingVData.x = [0, spreidingvalues[i][0] !== null ? 1 : 0]
        windSpreidingVData.y = [
          0.1 * Math.abs(spreidingvalues[i][0]),
          0.1 * Math.abs(spreidingvalues[i][1]),
        ]
        allWindSpreidingV.push([windSpreidingVData])
      }

      updateWindrose(
        allWindRichtingMetingen,
        allWindRichtingVerwachtingen,
        allWindSnelheidMetingen,
        allWindSnelheidVerwachtingen,
        allWindSpreidingR,
        allWindSpreidingV,
        allWindStoot,
        times,
      )
      updateChartWindTime(windSpeedTimeSeriesM, windSpeedTimeSeriesF, windStootTimeSeriesM)
      updateChartWindDirectionTime(windDirectionTimeSeriesM, windDirectionTimeSeriesF)

      resetTimeSlider(timesdata, true)
      setInterval(function () {
        resetTimeSlider(timesdata, false)
      }, 60000)
    }
  }
  const initRange = [[{ x: [0, 1], y: [0, 1], v: 100 }], [{ x: [0, 1], y: [0, 1], v: 100 }]]
  const initScalar = [
    [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
  ]

  setupWindrose(initRange, initRange, initRange, initRange, initRange, initRange, initScalar, [1])
  request.open('GET', '/examples/data/wind_data3.json', true)
  request.send()
}

get_wind_data()

addListenerByClassName('theme-button', 'click', () =>
  document.documentElement.classList.toggle('dark'),
)
