import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './colourbar.css'

import * as d3 from 'd3'
import { ColourBar } from '@lib'
import { addListenerByClassName } from '@shared'

const colorMap = [
  {
    lowerValue: -2.0,
    color: '#070268',
  },
  {
    lowerValue: -1.5,
    color: '#0900ae',
  },
  {
    lowerValue: -1.0,
    color: '#4040ff',
  },
  {
    lowerValue: -0.5,
    color: '#0080c0',
  },
  {
    lowerValue: 0.0,
    color: '#129ffe',
  },
  {
    lowerValue: 0.5,
    color: '#00ff40',
  },
  {
    lowerValue: 1.0,
    color: '#ffff00',
  },
  {
    lowerValue: 1.5,
    color: '#ff8000',
  },
  {
    lowerValue: 2.0,
    color: '#ff0000',
  },
  {
    lowerValue: 2.5,
    color: '#a80000',
  },
  {
    lowerValue: 3.0,
    color: '#800000',
  },
]

const nonLinearColorMap = [
  {
    lowerValue: 0.0,
    color: '#9fb9bf',
  },
  {
    lowerValue: 0.5,
    color: '#309db9',
  },
  {
    lowerValue: 1.0,
    color: '#30628d',
  },
  {
    lowerValue: 1.5,
    color: '#3868bf',
  },
  {
    lowerValue: 2.0,
    color: '#393c8e',
  },
  {
    lowerValue: 2.5,
    color: '#bb5abf',
  },
  {
    lowerValue: 3.0,
    color: '#9a3097',
  },
  {
    lowerValue: 4.0,
    color: '#853030',
  },
  {
    lowerValue: 5.0,
    color: '#bf335f',
  },
  {
    lowerValue: 7.0,
    color: '#bf6757',
  },
  {
    lowerValue: 10.0,
    color: '#bfbfbf',
  },
]

const colorMapSpeed = [
  {
    lowerValue: -4.0,
    color: '#404d8f',
  },
  {
    lowerValue: -3.2,
    color: '#32568e',
  },
  {
    lowerValue: -2.4,
    color: '#327b8e',
  },
  {
    lowerValue: -1.6,
    color: '#407867',
  },
  {
    lowerValue: -0.8,
    color: '#328532',
  },
  {
    lowerValue: 0.0,
    color: '#328d32',
  },
  {
    lowerValue: 0.8,
    color: '#8e8432',
  },
  {
    lowerValue: 1.6,
    color: '#8e7132',
  },
  {
    lowerValue: 2.4,
    color: '#824d3d',
  },
  {
    lowerValue: 3.2,
    color: '#733244',
  },
  {
    lowerValue: 4.0,
    color: '#8e3268',
  },
]

const colorMapWind = [
  { lowerValue: 0, color: 'rgb(98,113,183)' },
  { lowerValue: 1, color: 'rgb(57,97,159)' },
  { lowerValue: 3, color: 'rgb(74,148,169)' },
  { lowerValue: 5, color: 'rgb(77,141,123)' },
  { lowerValue: 7, color: 'rgb(83,165,83)' },
  { lowerValue: 9, color: 'rgb(53,159,53)' },
  { lowerValue: 11, color: 'rgb(167,157,81)' },
  { lowerValue: 13, color: 'rgb(159,127,58)' },
  { lowerValue: 15, color: 'rgb(161,108,92)' },
  { lowerValue: 17, color: 'rgb(129,58,78)' },
  { lowerValue: 19, color: 'rgb(175,80,136)' },
  { lowerValue: 21, color: 'rgb(117,74,147)' },
  { lowerValue: 24, color: 'rgb(109,97,163)' },
  { lowerValue: 27, color: 'rgb(68,105,141)' },
  { lowerValue: 29, color: 'rgb(92,144,152)' },
  { lowerValue: 36, color: 'rgb(125,68,165)' },
  { lowerValue: 46, color: 'rgb(231,215,215)' },
]

const svg0 = d3
  .select('#chart-container-0')
  .append('svg')
  .attr('width', 500)
  .attr('height', 60)
  .append('g')
  .attr('transform', 'translate(50, 20)')
new ColourBar(svg0, colorMap, 400, 20, {
  position: 'top',
  useGradients: true,
})

const svg1 = d3
  .select('#chart-container-1')
  .append('svg')
  .attr('class', 'colourbar')
  .attr('width', 500)
  .attr('height', 70)
  .append('g')
  .attr('transform', 'translate(50, 30)')
// Create ColourBar from SVGGElement directly from the DOM.
const group = document.querySelector('#chart-container-1 svg g')
new ColourBar(group, nonLinearColorMap, 400, 20, {
  position: 'bottom',
  useGradients: true,
  title: 'Title [unit]',
  type: 'nonlinear',
  ticks: 6,
})

const svg2 = d3
  .select('#chart-container-2')
  .append('svg')
  .attr('width', 500)
  .attr('height', 60)
  .append('g')
  .attr('transform', 'translate(50, 20)')
new ColourBar(svg2, colorMap, 400, 20, {
  position: 'bottom',
  useGradients: false,
})

const svg3 = d3
  .select('#chart-container-3')
  .append('svg')
  .attr('class', 'colourbar')
  .attr('width', 500)
  .attr('height', 70)
  .append('g')
  .attr('transform', 'translate(50, 30)')
new ColourBar(svg3, colorMapWind, 400, 20, {
  position: 'bottom',
  useGradients: true,
  title: 'Windsnelheid [m/s]',
  type: 'nonlinear',
  tickValues: [0, 3, 5, 10, 15, 20, 30],
})

const svg4 = d3
  .select('#chart-container-4')
  .append('svg')
  .attr('class', 'colourbar')
  .attr('width', 500)
  .attr('height', 70)
  .append('g')
  .attr('transform', 'translate(50, 30)')
new ColourBar(svg4, colorMapWind, 400, 20, {
  position: 'bottom',
  useGradients: true,
  title: 'Windsnelheid [m/s]',
  type: 'nonlinear',
  tickValues: [0, 2.4, 6.7, 12.3, 18.9, 26.4],
})

const svg5 = d3
  .select('#chart-container-5')
  .append('svg')
  .attr('class', 'colourbar')
  .attr('width', 500)
  .attr('height', 70)
  .append('g')
  .attr('transform', 'translate(50, 30)')
new ColourBar(svg5, colorMapSpeed, 400, 20, {
  position: 'bottom',
  useGradients: true,
  title: 'Stroomsnelheid [m/s]',
  type: 'nonlinear',
  ticks: 10,
})

const svg6 = d3
  .select('#chart-container-5')
  .append('svg')
  .attr('class', 'colourbar')
  .attr('width', 500)
  .attr('height', 70)
  .append('g')
  .attr('transform', 'translate(50, 30)')
new ColourBar(svg6, colorMapSpeed, 400, 20, {
  position: 'bottom',
  useGradients: true,
  title: 'Stroomsnelheid [m/s]',
  type: 'nonlinear',
  tickValues: [-4, -3, -2, -1, 0, 1, 2, 3, 4],
})

const svgLeft = d3
  .select('#chart-container-left')
  .append('svg')
  .attr('width', 120)
  .attr('height', 500)
  .append('g')
  .attr('transform', 'translate(50, 50)')
new ColourBar(svgLeft, colorMap, 20, 400, {
  position: 'left',
  useGradients: true,
})

const svgRight = d3
  .select('#chart-container-right')
  .append('svg')
  .attr('width', 120)
  .attr('height', 500)
  .append('g')
  .attr('transform', 'translate(50, 50)')
new ColourBar(svgRight, colorMap, 20, 400, {
  position: 'right',
  useGradients: true,
})

addListenerByClassName('theme-button', 'click', () =>
  document.documentElement.classList.toggle('dark'),
)
