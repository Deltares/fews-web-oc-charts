import '../../src/scss/wb-charts.scss'
import '../shared/shared.css'
import './wind-current-roses.css'

import {
  ChartArrow,
  ChartLine,
  ChartRange,
  DataField,
  Direction,
  PolarAxes,
  scaleBeaufort,
  scaleCurrentCategories,
  scaleWindCategories,
  TooltipAnchor,
} from '../../src'
import { addListenerByClassName } from '../shared'

const styleForecast = {
  fill: 'rgb(214, 39, 40)',
  stroke: 'rgb(214, 39, 40)',
  'stroke-width': '1.5px',
}
const styleMeasurement = {
  fill: 'rgb(79, 193, 255)',
  stroke: 'rgb(79, 193, 255)',
  'stroke-width': '1.5px',
}
const styleSurge = {
  fill: 'none',
  stroke: 'rgb(156, 220, 254)',
  'stroke-width': '1.5px',
}
const styleRange = {
  fill: 'rgba(79, 193, 255, 0.5)',
  stroke: 'none',
}

let polarAxisWind1
let polarAxisWind2
let windSpeedMeasurement
let windSpeedForecast
let windDirectionRange
let datafieldWindDirection
let datafieldWindSpeed
let datafieldWindStoot

let transitionTime = null

const unitsSpeedWind = [
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
const unitsSpeedCurrent = [
  { unit: ' m/s', factor: 1.0, precision: '.2f' },
  { unit: ' kt', factor: 1.943844, precision: '.2f' },
  { unit: ' km/h', factor: 3.6, precision: '.2f' },
]
const unitsDegreeWind = [
  { unit: '°', factor: 1.0, precision: '.0f' },
  { unit: '', scale: scaleWindCategories },
]
const unitsDegreeCurrent = [
  { unit: '°', factor: 1.0, precision: '.0f' },
  { unit: '', scale: scaleCurrentCategories },
]

const arrowSize = 64

const currentSpeedMeasurement = 0.41 // m/s
const currentSpeedForecast = 0.42 // m/s
const currentDirectionMeasurement = 189 // degrees
const currentDirectionForecast = 186 // degrees
const crossCurrentSpeedMeasurement = 0.408 // m/s
const crossCurrentSpeedForecast = 0.412 // m/s

function setupCurrentRose() {
  // Current rose charts
  // Create two charts, with different intersects and direction
  const containerCurrentrose1 = document.getElementById('chart-current-rose1')
  const polarAxisCurrent1 = new PolarAxes(containerCurrentrose1, null, null, {
    angular: {
      direction: Direction.CLOCKWISE,
      intercept: Math.PI / 2,
      format: (value) => `${value}°`,
    },
    innerRadius: 0.5,
  })

  const containerCurrentrose2 = document.getElementById('chart-current-rose2')
  const polarAxisCurrent2 = new PolarAxes(containerCurrentrose2, null, null, {
    angular: {
      direction: Direction.ANTICLOCKWISE,
      intercept: 0,
      format: (value) => `${value}°`,
    },
    innerRadius: 0.5,
  })

  const containerCurrentrose3 = document.getElementById('chart-current-rose3')
  const polarAxisCurrent3 = new PolarAxes(containerCurrentrose3, null, null, {
    angular: {
      direction: Direction.ANTICLOCKWISE,
      intercept: Math.PI / 3,
      format: (value) => `${value}°`,
    },
    innerRadius: 0.5,
  })

  const polarAxesCurrent = [polarAxisCurrent1, polarAxisCurrent2, polarAxisCurrent3]
  polarAxesCurrent.forEach((polarAxisCurrent, index) => {
    // Invisible lines used for datafields
    const CurrentSpeedMeasurement = new ChartLine(
      [
        { x: 0, y: currentSpeedMeasurement },
        { x: 0, y: currentSpeedMeasurement },
      ],
      {}
    )
    const CurrentSpeedForecast = new ChartLine(
      [
        { x: 0, y: currentSpeedForecast },
        { x: 0, y: currentSpeedForecast },
      ],
      {}
    )
    const CrossCurrentSpeedMeasurement = new ChartLine(
      [
        { x: 0, y: crossCurrentSpeedMeasurement },
        { x: 0, y: crossCurrentSpeedMeasurement },
      ],
      {}
    )
    const CrossCurrentSpeedForecast = new ChartLine(
      [
        { x: 0, y: crossCurrentSpeedForecast },
        { x: 0, y: crossCurrentSpeedForecast },
      ],
      {}
    )

    // Arrows
    let yDirectionMeasurement = [currentDirectionMeasurement, currentDirectionMeasurement]
    if (index === 2) {
      // One chart with 'null' as values, to test arrow and data field
      yDirectionMeasurement = [null, null]
    }

    const CurrentDirectionArrowMeasurement = new ChartArrow(
      [{ x: [0, 1], y: yDirectionMeasurement }],
      {
        transitionTime: transitionTime,
        symbol: { size: arrowSize },
        radial: { includeInTooltip: false },
        tooltip: { anchor: TooltipAnchor.Pointer },
      }
    )
    const CurrentDirectionArrowForecast = new ChartArrow(
      [{ x: [0, 1], y: [currentDirectionForecast, currentDirectionForecast] }],
      {
        transitionTime: transitionTime,
        symbol: { size: arrowSize },
        radial: { includeInTooltip: false },
        tooltip: { anchor: TooltipAnchor.Pointer },
      }
    )

    CurrentSpeedMeasurement.addTo(
      polarAxisCurrent,
      { radial: { key: 'x' }, angular: { key: 'y' } },
      `current-measured-${index}`,
      styleMeasurement
    )
    CurrentSpeedForecast.addTo(
      polarAxisCurrent,
      { radial: { key: 'x' }, angular: { key: 'y' } },
      `current-forecast-${index}`,
      styleForecast
    )
    CrossCurrentSpeedMeasurement.addTo(
      polarAxisCurrent,
      { radial: { key: 'x' }, angular: { key: 'y' } },
      `cross-current-measured-${index}`,
      styleMeasurement
    )
    CrossCurrentSpeedForecast.addTo(
      polarAxisCurrent,
      { radial: { key: 'x' }, angular: { key: 'y' } },
      `cross-current-forecast-${index}`,
      styleForecast
    )
    CurrentDirectionArrowMeasurement.addTo(
      polarAxisCurrent,
      { radial: { key: 'x' }, angular: { key: 'y' } },
      `current-direction-measurement-arrow-${index}`,
      styleMeasurement
    )
    CurrentDirectionArrowForecast.addTo(
      polarAxisCurrent,
      { radial: { key: 'x' }, angular: { key: 'y' } },
      `current-direction-forecast-arrow-${index}`,
      styleForecast
    )

    const datafieldCurrentDirection = new DataField(polarAxisCurrent.canvas, {
      selector: [
        `current-direction-measurement-arrow-${index}`,
        `current-direction-forecast-arrow-${index}`,
      ],
      labelField: { text: 'richting' },
      valueField: { hyphen: ' / ', units: unitsDegreeCurrent },
    })

    const datafieldCurrentSpeed = new DataField(polarAxisCurrent.canvas, {
      selector: [`current-measured-${index}`, `current-forecast-${index}`],
      labelField: { text: 'stroomsnelheid' },
      valueField: { hyphen: ' / ', units: unitsSpeedCurrent },
    })

    const datafieldCrossCurrentSpeed = new DataField(polarAxisCurrent.canvas, {
      selector: [`cross-current-measured-${index}`, `cross-current-forecast-${index}`],
      labelField: { text: 'dwarsstroomsnelheid' },
      valueField: { hyphen: ' / ', units: unitsSpeedCurrent },
    })

    // Draw
    polarAxisCurrent.redraw()

    // Add visitors
    polarAxisCurrent.accept(datafieldCurrentDirection)
    polarAxisCurrent.accept(datafieldCurrentSpeed)
    polarAxisCurrent.accept(datafieldCrossCurrentSpeed)
  })
}

function setupWindRose(
  windRichtingMetingen,
  windRichtingVerwachtingen,
  windSnelheidMetingen,
  windSnelheidVerwachtingen,
  windStoot,
  allWindSpreidingR
) {
  // Wind rose charts
  // Create two charts, with different intersects and direction
  const containerWindrose1 = document.getElementById('chart-wind-rose1')
  polarAxisWind1 = new PolarAxes(containerWindrose1, null, null, {
    angular: {
      direction: Direction.CLOCKWISE,
      intercept: Math.PI / 2,
      format: (value) => `${value}°`,
    },
    innerRadius: 0.5,
  })

  const containerWindrose2 = document.getElementById('chart-wind-rose2')
  polarAxisWind2 = new PolarAxes(containerWindrose2, null, null, {
    angular: {
      direction: Direction.ANTICLOCKWISE,
      intercept: Math.PI,
      format: (value) => `${value}°`,
    },
    innerRadius: 0.5,
  })

  const polarAxesWind = [polarAxisWind1, polarAxisWind2]
  polarAxesWind.forEach((polarAxisWind) => {
    const position = 277
    windDirectionRange = new ChartRange(allWindSpreidingR[position], {
      transitionTime: transitionTime,
      radial: { includeInTooltip: false },
      tooltip: { anchor: 'center' },
    })

    // Invisible lines used for datafields
    windSpeedMeasurement = new ChartLine(windSnelheidMetingen[position], {})
    windSpeedForecast = new ChartLine(windSnelheidVerwachtingen[position], {})
    const windSurge = new ChartLine(windStoot[position], {})

    // Arrows
    const windDirectionArrowMeasurement = new ChartArrow(windRichtingMetingen[position], {
      transitionTime: transitionTime,
      symbol: { size: arrowSize },
    })
    const windDirectionArrowForecast = new ChartArrow(windRichtingVerwachtingen[position], {
      transitionTime: transitionTime,
      symbol: { size: arrowSize },
      radial: { includeInTooltip: false },
      tooltip: { anchor: TooltipAnchor.Pointer },
    })

    windDirectionRange.addTo(
      polarAxisWind,
      { radial: { key: 'x' }, angular: { key: 'y' } },
      'wind-direction-range',
      styleRange
    )
    windSpeedMeasurement.addTo(
      polarAxisWind,
      { radial: { key: 'x' }, angular: { key: 'y' } },
      'wind-measured',
      styleMeasurement
    )
    windSpeedForecast.addTo(
      polarAxisWind,
      { radial: { key: 'x' }, angular: { key: 'y' } },
      'wind-forecast',
      styleForecast
    )
    windSurge.addTo(
      polarAxisWind,
      { radial: { key: 'x' }, angular: { key: 'y' } },
      'windstoot',
      styleSurge
    )
    windDirectionArrowMeasurement.addTo(
      polarAxisWind,
      { radial: { key: 'x' }, angular: { key: 'y' } },
      'wind-direction-measurement-arrow',
      styleMeasurement
    )
    windDirectionArrowForecast.addTo(
      polarAxisWind,
      { radial: { key: 'x' }, angular: { key: 'y' } },
      'wind-direction-forecast-arrow',
      styleForecast
    )

    datafieldWindDirection = new DataField(polarAxisWind.canvas, {
      selector: ['wind-direction-measurement-arrow', 'wind-direction-forecast-arrow'],
      labelField: { text: 'richting' },
      valueField: { hyphen: ' / ', units: unitsDegreeWind },
    })

    datafieldWindSpeed = new DataField(polarAxisWind.canvas, {
      selector: ['wind-measured', 'wind-forecast'],
      labelField: { text: 'windsnelheid' },
      valueField: { hyphen: ' / ', units: unitsSpeedWind },
    })

    datafieldWindStoot = new DataField(polarAxisWind.canvas, {
      selector: 'windstoot',
      labelField: { text: 'windstoot' },
      valueField: { units: unitsStoot },
    })

    // Draw
    polarAxisWind.redraw()

    // Add visitors
    polarAxisWind.accept(datafieldWindDirection)
    polarAxisWind.accept(datafieldWindSpeed)
    polarAxisWind.accept(datafieldWindStoot)
  })
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
      const timesdata = []

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
        metingSnelheidData2.x = 0 // line should be invisible
        metingSnelheidData2.y = metingSnelheidData1.y
        allWindSnelheidMetingen.push([metingSnelheidData1, metingSnelheidData2])

        const metingStootData1 = {}
        const metingstootData2 = {}
        metingStootData1.x = 0
        metingStootData1.y = metingvalues[i][3] !== null ? Math.abs(0.1 * metingvalues[i][3]) : null // scale down by factor 10 for m/sec
        metingstootData2.x = 0 // line should be invisible
        metingstootData2.y = metingStootData1.y
        allWindStoot.push([metingStootData1, metingstootData2])

        const verwachtingSnelheidData1 = {}
        const verwachtingSnelheidData2 = {}
        verwachtingSnelheidData1.x = 0
        verwachtingSnelheidData1.y = Math.abs(0.1 * verwachtingvalues[i][0]) // scale down by factor 10 for m/sec
        verwachtingSnelheidData2.x = 0 // line should be invisible
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

      setupWindRose(
        allWindRichtingMetingen,
        allWindRichtingVerwachtingen,
        allWindSnelheidMetingen,
        allWindSnelheidVerwachtingen,
        allWindStoot,
        allWindSpreidingR
      )
    }
  }
  request.open('GET', '/examples/data/wind_data3.json', true)
  request.send()
}

// get wind data and draw the wind roses
get_wind_data()
// draw the current roses
setupCurrentRose()

addListenerByClassName('theme-button', 'click', () =>
  document.documentElement.classList.toggle('dark')
)
