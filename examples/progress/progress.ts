import '../../src/scss/wb-charts.scss'
import '../shared/shared.css'
import './progress.css'

import { AUTO_SCALE, AxisType, ChartProgress, PolarAxes } from '../../src'
import { addListenerByClassName, addListenerById } from '../shared'

const startDay = new Date(Date.now())
startDay.setMinutes(0)
startDay.setHours(0)
startDay.setSeconds(0)
const endDay = new Date(startDay)
endDay.setHours(12)

const now = new Date(startDay)
now.setHours(8)

const p0 = new Date(startDay)
p0.setHours(2)

const a0 = new Date(p0)
a0.setMinutes(15)

const p1 = new Date(startDay)
p1.setHours(5)

const a1 = new Date(p1)
a1.setMinutes(15)

const p2 = new Date(startDay)
p2.setHours(9)

const a2 = new Date(p2)
a2.setMinutes(15)

const p3 = new Date(startDay)
p3.setHours(10)

const a3 = new Date(p3)
a3.setMinutes(15)

const dateFormat = () =>
  new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).format()

const container1 = document.getElementById('chart-1')
const polarAxis1 = new PolarAxes(container1, null, null, {
  angular: {
    direction: -1,
    range: [0, 2 * Math.PI],
    intercept: Math.PI / 2,
    domain: [startDay, endDay],
    type: AxisType.time,
    format: dateFormat,
    showGrid: false,
  },
  radial: {
    type: AxisType.band,
    showGrid: false,
  },
  innerRadius: 0.5,
})

const container2 = document.getElementById('chart-2')
const polarAxis2 = new PolarAxes(container2, null, null, {
  angular: {
    direction: -1,
    range: [Math.PI / 3, (5 * Math.PI) / 3],
    intercept: Math.PI / 2,
    domain: [p0, p3],
    type: AxisType.time,
    format: dateFormat,
    showGrid: false,
  },
  radial: {
    type: AxisType.band,
    showGrid: false,
  },
  innerRadius: 0.5,
})

const planning = [
  {
    x: 'HIRLAM',
    y: [p0, p1],
    v: 0,
  },
  {
    x: 'DCSMv6',
    y: [p1, p2],
    v: 1,
  },
  {
    x: 'DCSMv6-KF',
    y: [p1, p3],
    v: 2,
  },
]
const progressData = [
  {
    x: 'HIRLAM',
    y: [a0, a1],
    v: 0,
  },
  {
    x: 'DCSMv6',
    y: [a1, now],
    v: 1,
  },
  {
    x: 'DCSMv6-KF',
    y: [a1, now],
    v: 2,
  },
]

const expextedData = [
  {
    x: 'HIRLAM',
    y: [a0, a1],
    v: 0,
  },
  {
    x: 'DCSMv6',
    y: [a1, a2],
    v: 1,
  },
  {
    x: 'DCSMv6-KF',
    y: [a1, a3],
    v: 2,
  },
]

const planned = new ChartProgress(planning, {
  colorScale: AUTO_SCALE,
  t: {
    format: dateFormat,
  },
  style: {
    fill: 'none',
    'stroke-width': '2px',
    stroke: 'currentColor',
    'stroke-dasharray': '5 5',
  },
})
const progress = new ChartProgress(progressData, {
  colorScale: AUTO_SCALE,
  t: {
    format: dateFormat,
  },
})
const expected = new ChartProgress(expextedData, {
  colorScale: AUTO_SCALE,
  t: {
    format: dateFormat,
  },
  style: {
    'fill-opacity': '.1',
  },
})

expected.addTo(polarAxis1, {
  radial: {
    key: 'x',
  },
  angular: {
    key: 'y',
  },
  color: {
    key: 'v',
  },
})
progress.addTo(polarAxis1, {
  radial: {
    key: 'x',
  },
  angular: {
    key: 'y',
  },
  color: {
    key: 'v',
  },
})
planned.addTo(polarAxis1, {
  radial: {
    key: 'x',
  },
  angular: {
    key: 'y',
  },
  color: {
    key: 'v',
  },
})

polarAxis1.redraw()

const planned2 = new ChartProgress(planning, {
  colorScale: AUTO_SCALE,
  t: {
    format: dateFormat,
  },
  style: {
    fill: 'none',
    'stroke-width': '2px',
    stroke: 'currentColor',
    'stroke-dasharray': '5 5',
  },
})
const progress2 = new ChartProgress(progressData, {
  colorScale: AUTO_SCALE,
  t: {
    format: dateFormat,
  },
})

const expected2 = new ChartProgress(expextedData, {
  colorScale: AUTO_SCALE,
  t: {
    format: dateFormat,
  },
  style: {
    'fill-opacity': '.1',
  },
})

expected2.addTo(polarAxis1, {
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
progress2.addTo(polarAxis1, {
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
planned2.addTo(polarAxis1, {
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
polarAxis2.redraw()

function saveSvgAsPng(svgElement, name) {
  // FIXME: the functions for saving charts no longer exist in
  //        fews-web-oc-charts.
  const bbox = svgElement.getBoundingClientRect()
  const svgString = getSvgAsString(svgElement)
  svgStringToImage(svgString, 2 * bbox.width, 2 * bbox.height, save)

  function save(dataBlob, filesize) {
    saveAs(dataBlob, `${name}.png`)
  }
}

function download() {
  const element = document.getElementById('1')
  saveSvgAsPng(element.children[0], 'hello')
}

function togglePrintSheet() {
  // FIXME: switching from light to dark mode works differently from when this
  //        was written.
  let status
  for (let i = 0; i < document.styleSheets.length; i++) {
    const s = document.styleSheets[i]
    if (s.href !== undefined && s.href.match(/wb-charts-dark\.css/)) {
      s.disabled = !s.disabled
      status = s.disabled
    }
  }
  for (let i = 0; i < document.styleSheets.length; i++) {
    const s = document.styleSheets[i]
    if (s.href !== undefined && s.href.match(/wb-charts-print\.css/)) {
      s.disabled = !status
      console.log(s.disabled)
    }
  }
}

addListenerById('download-btn', 'click', download)
addListenerById('toggle-print-sheet', 'click', togglePrintSheet)
addListenerByClassName('theme-button', 'click', () =>
  document.documentElement.classList.toggle('dark')
)
