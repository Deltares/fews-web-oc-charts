import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './wind-direction.css'

import {
  AxisType,
  CartesianAxes,
  ChartArrow,
  ChartDirection,
  ChartLine,
  ChartMarker,
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

let beaufortAxis
let windDirectionMeasurement
let windDirectionForecast
let windSpeedMeasurement
let windSpeedForecast
let windAmplitudeText
let windDirectionRange
let windSpeedRange
let windStootChart
let polarText
let polarText1
let polarText2
let windStootText

let windSpeedTimeM
let windSpeedTimeF
let windStootTimeM
let windDirectionTimeM
let windDirectionTimeF

let beaufortScale
let timesdata

const target = 40
const transitionTime = null

addListenerById('slider-reset-button', 'click', () => resetTimeSlider(timesdata, true))

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

function getZoomLimit(upperLimit) {
  const zoomLevels = [32.7, 20.8, 10.8]
  let result = upperLimit
  for (let i = 0; i < zoomLevels.length; i++) {
    if (upperLimit > zoomLevels[i]) {
      break
    } else {
      result = zoomLevels[i]
    }
  }
  return result
}

function updateBeaufortScale(target) {
  const beaufortLimits = [0, 0.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7, 40]
  const limits = beaufortLimits.filter(function (x) {
    return x <= target
  })
  beaufortScale.domain(Object.keys(limits))
  beaufortScale.range(
    limits.map(function (x) {
      return (x / target) * windSpeedAxis.width
    })
  )
  return beaufortScale
}

function speedDataFormatter(d) {
  if (!d[0] || d[0].x === null) {
    return '-' + '[m/s]\t' + '-' + '[kt]\t' + '-' + '[km/h]'
  }
  const format = d3.format('.1f')
  const value = d[0].y !== null ? format(d[0].y) : '-'
  const knots = d[0].y !== null ? format(d[0].y * 1.943844) : '-'
  const kmph = d[0].y !== null ? format(d[0].y * 3.6) : '-'
  return value + '[m/s]\t' + knots + '[kt]\t' + kmph + '[km/h]'
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
  times
) {
  // Wind rose chart
  const containerWindrose = document.getElementById('chart-wind-rose')
  polarAxis = new PolarAxes(containerWindrose, null, null, {
    angular: {
      direction: Direction.CLOCKWISE,
      intercept: Math.PI / 2,
    },
    innerRadius: 0.5,
  })
  windDirectionMeasurement = new ChartArrow(windRichtingMetingen[0], {
    transitionTime: transitionTime,
    symbol: { size: 64 },
  })
  windDirectionForecast = new ChartArrow(windRichtingVerwachtingen[0], {
    transitionTime: transitionTime,
    symbol: { size: 64 },
  })
  windDirectionRange = new ChartRange(allWindSpreidingR[0], {
    transitionTime: transitionTime,
    r: { includeInTooltip: false },
    tooltip: { anchor: TooltipAnchor.Center },
  })
  windDirectionRange.addTo(
    polarAxis,
    { radial: { key: 'x' }, angular: { key: 'y' } },
    'direction-range',
    '#polar-range'
  )
  windDirectionMeasurement.addTo(
    polarAxis,
    { radial: { key: 'x' }, angular: { key: 'y' } },
    'direction-measured',
    '#polar-line'
  )
  windDirectionForecast.addTo(
    polarAxis,
    { radial: { key: 'x' }, angular: { key: 'y' } },
    'direction-forecast',
    '#polar-line-forecast'
  )

  polarText = new DataField(polarAxis.canvas, {
    selector: 'direction-measured',
    labelField: { text: 'richting' },
    valueField: { units: degree },
  })

  polarText1 = new DataField(polarAxis.canvas, {
    selector: 'wind',
    labelField: { text: 'windsnelheid' },
    valueField: { units: unitsSpeed },
  })

  polarText2 = new DataField(polarAxis.canvas, {
    selector: 'stoot',
    labelField: { text: 'windstoot' },
    valueField: { units: unitsStoot },
  })

  // Wind speed chart
  const containerWindSpeed = document.getElementById('chart-wind-speed')
  windSpeedAxis = new CartesianAxes(containerWindSpeed, null, null, {
    transitionTime: transitionTime,
    x: [
      {
        unit: '[m/s]',
        domain: [0, 40],
        position: 'bottom',
        showGrid: true,
      },
      {
        position: 'top',
        unit: '[Bft]',
      },
    ],
    y: [{ position: 'left' }],
    margin: {
      bottom: 60,
    },
  })
  const zoomLimit = getZoomLimit(target)

  windSpeedRange = new ChartRange(allWindSpreidingV[0], {
    transitionTime: transitionTime,
    x: { includeInTooltip: false },
    tooltip: { anchor: TooltipAnchor.Center },
  })
  windSpeedMeasurement = new ChartLine(windSnelheiMetingen[0], {
    transitionTime: transitionTime,
  })
  windSpeedForecast = new ChartLine(windSnelheiVerwachtingen[0], {
    transitionTime: transitionTime,
  })

  windSpeedRange.addTo(
    windSpeedAxis,
    { x: { key: 'y', axisIndex: 0 }, y: { key: 'x', axisIndex: 0 } },
    'cartesian-range',
    '#cartesian-range'
  )
  windSpeedMeasurement.addTo(
    windSpeedAxis,
    { x: { key: 'y', axisIndex: 0 }, y: { key: 'x', axisIndex: 0 } },
    'wind',
    '#wind-line'
  )
  windSpeedForecast.addTo(
    windSpeedAxis,
    { x: { key: 'y', axisIndex: 0 }, y: { key: 'x', axisIndex: 0 } },
    'wind-forecast',
    '#forecast'
  )

  windAmplitudeText = new DataField(
    windSpeedAxis.canvas,
    {
      selector: 'wind',
      labelField: { text: 'windsnelheid' },
    },
    speedDataFormatter
  )

  // Wind stoot chart
  const containerWindstoot = document.getElementById('chart-wind-stoot')
  windStootAxis = new CartesianAxes(containerWindstoot, null, null, {
    transitionTime: transitionTime,
    x: [
      {
        unit: '[m/s]',
        domain: [0, 40],
        position: 'bottom',
        showGrid: true,
      },
    ],
    margin: {
      bottom: 60,
    },
    y: [],
  })
  windStootChart = new ChartLine(allWindStoot[0], { transitionTime: transitionTime })
  windStootChart.addTo(
    windStootAxis,
    { x: { key: 'y', axisIndex: 0 }, y: { key: 'x', axisIndex: 0 } },
    'stoot',
    '#stoot-line'
  )

  windStootText = new DataField(
    windStootAxis.canvas,
    {
      selector: 'stoot',
      labelField: { text: 'windstoot' },
    },
    speedDataFormatter
  )

  // Time chart wind speed
  const containerWindSpeedTime = document.getElementById('chart-wind-speed-time')
  windTimeAxis = new CartesianAxes(containerWindSpeedTime, null, null, {
    transitionTime: transitionTime,
    x: [{ type: AxisType.time, position: 'bottom', showGrid: true }],
    y: [
      {
        label: 'windsnelheid',
        unit: '[m/s]',
        domain: [0, 40],
        position: 'left',
        showGrid: true,
      },
    ],
  })
  windSpeedTimeM = new ChartLine(
    [
      { t: 0, y: 0 },
      { t: 1, y: 0 },
    ],
    { transitionTime: transitionTime }
  )
  windSpeedTimeF = new ChartLine(
    [
      { t: 0, y: 0 },
      { t: 1, y: 0 },
    ],
    { transitionTime: transitionTime }
  )
  windStootTimeM = new ChartLine(
    [
      { t: 0, y: 0 },
      { t: 1, y: 0 },
    ],
    { transitionTime: transitionTime }
  )
  windDirectionTimeM = new ChartMarker(
    [
      { t: 0, y: 0, d: 0 },
      { t: 1, y: 0, d: 0 },
    ],
    { transitionTime: transitionTime, symbol: { size: 32 }, skip: 1 }
  )
  windDirectionTimeF = new ChartDirection(
    [
      { t: 0, y: 0, d: 0 },
      { t: 1, y: 0, d: 0 },
    ],
    { transitionTime: transitionTime, symbol: { size: 64 } }
  )

  windSpeedTimeM.addTo(
    windTimeAxis,
    { x: { key: 't', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
    'wind',
    '#wind-line-time'
  )
  windStootTimeM.addTo(
    windTimeAxis,
    { x: { key: 't', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
    'windstoot',
    '#windstoot-line-time'
  )
  windSpeedTimeF.addTo(
    windTimeAxis,
    { x: { key: 't', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
    'wind-forecast',
    '#forecast-time'
  )
  windDirectionTimeM.addTo(
    windTimeAxis,
    { x: { key: 't', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 }, value: { key: 'y' } },
    'wind',
    '#winddirection-line-time'
  )
  windDirectionTimeF.addTo(
    windTimeAxis,
    { x: { key: 't', axisIndex: 0 }, y: { key: 'd', axisIndex: 0 }, value: { key: 'y' } },
    'winddirection-forecast',
    '#directionforecast-time'
  )

  const legendWindTime = new Legend(
    [
      { selector: 'windstoot', label: 'Windstoot meting' },
      { selector: 'wind', label: 'Windsnelheid meting' },
      { selector: 'wind-forecast', label: 'Windsnelheid verwachting' },
      { selector: 'winddirection-forecast', label: 'Windrichting verwachting' },
    ],
    document.getElementById('legend-wind-speed-time')
  )

  windSpeedAxis.canvas.append('g').attr('class', 'axis x2-axis')

  beaufortScale = d3.scaleLinear()
  beaufortScale = updateBeaufortScale(zoomLimit)
  beaufortAxis = d3.axisTop(beaufortScale).tickValues([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  windSpeedAxis.canvas.select('.x2-axis').call(beaufortAxis)

  // Draw
  windSpeedAxis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
  windStootAxis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
  polarAxis.redraw()
  windTimeAxis.redraw({ x: { autoScale: true } })

  // Add visitors
  polarAxis.accept(polarText)
  windSpeedAxis.accept(polarText1)
  windSpeedAxis.accept(windAmplitudeText)
  windStootAxis.accept(windStootText)
  windStootAxis.accept(polarText2)
  windTimeAxis.accept(legendWindTime)

  const sliderdt = document.getElementById('slider-datetime')
  sliderdt.innerHTML = dateFormatter(new Date(times[0] * 1000), 'yyyy-MM-DD HH:mm ZZZZ', {
    timeZone: 'Europe/Amsterdam',
  })
}

function updateChartWindTime(
  windSpeedTimeSeriesM,
  windSpeedTimeSeriesF,
  windStootTimeSeriesM,
  windDirectionTimeSeriesF
) {
  windSpeedTimeM.data = windSpeedTimeSeriesM
  windSpeedTimeF.data = windSpeedTimeSeriesF
  windStootTimeM.data = windStootTimeSeriesM
  windDirectionTimeM.data = windSpeedTimeSeriesM
  windDirectionTimeF.data = windDirectionTimeSeriesF

  windTimeAxis.redraw({ x: { autoScale: true } })
  windTimeAxis.accept(new ZoomHandler())
  const mouseOverWindTime = new MouseOver([
    'windstoot',
    'wind',
    'wind-forecast',
    'winddirection-forecast',
  ])
  windTimeAxis.accept(mouseOverWindTime)
  windTimeAxis.accept(new CurrentTime({ x: { axisIndex: 0 } }))
}

function updateWindrose(
  windRichtingMetingen,
  windRichtingVerwachtingen,
  windSnelheidMetingen,
  windSnelheidVerwachtingen,
  windSpreidingR,
  windSpreidingV,
  windStoot,
  times
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

    const zoomLimit = getZoomLimit(target)
    beaufortScale = updateBeaufortScale(zoomLimit)

    polarAxis.redraw()
    windSpeedAxis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
    windStootAxis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
    windAmplitudeText.redraw()
    polarText.redraw()
    polarText1.redraw()
    polarText2.redraw()
    windStootText.redraw()

    windSpeedAxis.canvas.select('.x2-axis').transition(transitionTime).call(beaufortAxis)

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
          windSpeedTimeSeriesM.push({ t: dateTime, y: val, d: data.meting.values[i][0] })
          windDirectionTimeSeriesM.push({ t: dateTime, y: val, d: data.meting.values[i][0] })
          val = data.meting.values[i][2] !== null ? data.meting.values[i][3] * 0.1 : null
          windStootTimeSeriesM.push({ t: dateTime, y: val })
        }
      }

      const windSpeedTimeSeriesF = []
      const windDirectionTimeSeriesF = []
      for (let i = 0; i < data.verwachting.times.length; i++) {
        if (data.verwachting.values[i][0] || data.verwachting.values[i][2]) {
          const dateTime = new Date(data.verwachting.times[i] * 1000)
          windSpeedTimeSeriesF.push({
            t: dateTime,
            y: data.verwachting.values[i][0] * 0.1,
            d: data.verwachting.values[i][1],
          })
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
        times
      )
      updateChartWindTime(
        windSpeedTimeSeriesM,
        windSpeedTimeSeriesF,
        windStootTimeSeriesM,
        windSpeedTimeSeriesM
      )

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
  document.documentElement.classList.toggle('dark')
)
