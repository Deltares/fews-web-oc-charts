import '../../src/scss/wb-charts.scss'
import '../shared.css'
import './intercept-tests.css'

import * as d3 from 'd3'
import { AUTO_SCALE, ChartRange, Direction, PolarAxes, TooltipAnchor } from '../../src'
import { addListenerByClassName } from '../shared'

const container1 = document.getElementById('1')
const polarAxis1 = new PolarAxes(container1, null, null, {
  angular: {
    direction: Direction.CLOCKWISE,
    range: [0, Math.PI],
    intercept: Math.PI / 2,
  },
  innerRadius: 0.5,
})

const container2 = document.getElementById('2')
const polarAxis2 = new PolarAxes(container2, null, null, {
  angular: {
    direction: Direction.CLOCKWISE,
    range: [0, Math.PI],
    intercept: Math.PI / 4,
  },
  innerRadius: 0.5,
})

const container3 = document.getElementById('3')
const polarAxis3 = new PolarAxes(container3, null, null, {
  angular: { direction: Direction.CLOCKWISE, range: [0, Math.PI], intercept: 0 },
  innerRadius: 0.5,
})

const container4 = document.getElementById('4')
const polarAxis4 = new PolarAxes(container4, null, null, {
  angular: {
    direction: Direction.ANTICLOCKWISE,
    range: [0, Math.PI],
    intercept: Math.PI / 2,
  },
  innerRadius: 0.5,
})

const container5 = document.getElementById('5')
const polarAxis5 = new PolarAxes(container5, null, null, {
  angular: {
    direction: Direction.ANTICLOCKWISE,
    range: [0, Math.PI],
    intercept: Math.PI / 4,
  },
  innerRadius: 0.5,
})

const container6 = document.getElementById('6')
const polarAxis6 = new PolarAxes(container6, null, null, {
  angular: { direction: Direction.ANTICLOCKWISE, range: [0, Math.PI], intercept: 0 },
  innerRadius: 0.5,
})

const container7 = document.getElementById('7')
const polarAxis7 = new PolarAxes(container7, null, null, {
  angular: {
    direction: Direction.CLOCKWISE,
    range: [Math.PI / 8, (7 * Math.PI) / 8],
    intercept: Math.PI / 2,
  },
  innerRadius: 0.5,
})

const container8 = document.getElementById('8')
const polarAxis8 = new PolarAxes(container8, null, null, {
  angular: {
    direction: Direction.ANTICLOCKWISE,
    range: [Math.PI / 8, (7 * Math.PI) / 8],
    intercept: Math.PI / 2,
  },
  innerRadius: 0.5,
})

const container9 = document.getElementById('9')
const polarAxis9 = new PolarAxes(container9, null, null, {
  angular: {
    direction: Direction.CLOCKWISE,
    range: [-Math.PI / 4, (5 * Math.PI) / 4],
    intercept: Math.PI / 2,
  },
  innerRadius: 0.5,
})

const polarData = [
  [
    { x: [1, 2], y: [35, 85], v: 0 },
    { x: [2, 3], y: [30, 75], v: 0.5 },
    { x: [3, 4], y: [40, 65], v: 1 },
    { x: [4, 5], y: [50, 95], v: 2 },
    { x: [5, 6], y: [45, 90], v: 0.5 },
    { x: [6, 7], y: [-10, 15], v: 0 },
  ],
]
const plot1 = new ChartRange(polarData[0], {
  colorScale: AUTO_SCALE,
  tooltip: { anchor: TooltipAnchor.Center },
})
const plot2 = new ChartRange(polarData[0], {
  colorScale: AUTO_SCALE,
  tooltip: { anchor: TooltipAnchor.Center },
})
const plot3 = new ChartRange(polarData[0], {
  colorScale: AUTO_SCALE,
  tooltip: { anchor: TooltipAnchor.Center },
})
const plot4 = new ChartRange(polarData[0], {
  colorScale: AUTO_SCALE,
  tooltip: { anchor: TooltipAnchor.Center },
})
const plot5 = new ChartRange(polarData[0], {
  colorScale: AUTO_SCALE,
  tooltip: { anchor: TooltipAnchor.Center },
})
const plot6 = new ChartRange(polarData[0], {
  colorScale: AUTO_SCALE,
  tooltip: { anchor: TooltipAnchor.Center },
})
const plot7 = new ChartRange(polarData[0], {
  colorScale: AUTO_SCALE,
  tooltip: { anchor: TooltipAnchor.Center },
})
const plot8 = new ChartRange(polarData[0], {
  colorScale: AUTO_SCALE,
  tooltip: { anchor: TooltipAnchor.Center },
})
const plot9 = new ChartRange(polarData[0], {
  colorScale: AUTO_SCALE,
  tooltip: { anchor: TooltipAnchor.Center },
})

const random = []
for (let i = 0; i < 100; i++) {
  random.push({ x: d3.randomUniform(0, 1)(), y: d3.randomUniform(0, 360)() })
}

plot1.addTo(polarAxis1, {
  radial: { key: 'x', axisIndex: 0 },
  angular: { key: 'y', axisIndex: 0 },
  color: { key: 'v' },
})
polarAxis1.redraw()

plot2.addTo(polarAxis2, {
  radial: { key: 'x', axisIndex: 0 },
  angular: { key: 'y', axisIndex: 0 },
  color: { key: 'v' },
})
polarAxis2.redraw()

plot3.addTo(polarAxis3, {
  radial: { key: 'x', axisIndex: 0 },
  angular: { key: 'y', axisIndex: 0 },
  color: { key: 'v' },
})
polarAxis3.redraw()

plot4.addTo(polarAxis4, {
  radial: { key: 'x', axisIndex: 0 },
  angular: { key: 'y', axisIndex: 0 },
  color: { key: 'v' },
})
polarAxis4.redraw()

plot5.addTo(polarAxis5, {
  radial: { key: 'x', axisIndex: 0 },
  angular: { key: 'y', axisIndex: 0 },
  color: { key: 'v' },
})
polarAxis5.redraw()

plot6.addTo(polarAxis6, {
  radial: { key: 'x', axisIndex: 0 },
  angular: { key: 'y', axisIndex: 0 },
  color: { key: 'v' },
})
polarAxis6.redraw()

plot7.addTo(polarAxis7, {
  radial: { key: 'x', axisIndex: 0 },
  angular: { key: 'y', axisIndex: 0 },
  color: { key: 'v' },
})
polarAxis7.redraw()

plot8.addTo(polarAxis8, {
  radial: { key: 'x', axisIndex: 0 },
  angular: { key: 'y', axisIndex: 0 },
  color: { key: 'v' },
})
polarAxis8.redraw()

plot9.addTo(polarAxis9, {
  radial: { key: 'x', axisIndex: 0 },
  angular: { key: 'y', axisIndex: 0 },
  color: { key: 'v' },
})
polarAxis9.redraw()

addListenerByClassName('theme-button', 'click', () =>
  document.documentElement.classList.toggle('dark')
)
