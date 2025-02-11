import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './colourbar.css'

import '@shared/theme-button'

import colormapLinear from './linear.json'
import colormapNonLinear from './non-linear.json'

import * as d3 from 'd3'
import { ColourBar } from '@lib'

function getColourBarGroup(containerId: string): SVGGElement {
  const container = document.getElementById(containerId)
  const svg = container.querySelector('svg')
  return svg.querySelector('g')
}

function createColourBarGroup(
  containerId: string,
  isHorizontal: boolean = true,
): d3.Selection<SVGGElement, unknown, SVGSVGElement, unknown> {
  const group = d3
    .select(`#${containerId}`)
    .append('svg')
    .attr('width', isHorizontal ? 500 : 120)
    .attr('height', isHorizontal ? 60 : 500)
    .append('g')
    .attr('transform', 'translate(50, 20)')
  // Note: the d3 selection type that ColourBar accepts is not correctly
  //       specified, so we need this cast. See issue #136.
  return group as unknown as d3.Selection<SVGGElement, unknown, SVGSVGElement, unknown>
}

// Create non-interpolated linear color bar from an SVGGElement.
const groupLinearNonInterpolated = getColourBarGroup('container-linear-non-interpolated')
new ColourBar(groupLinearNonInterpolated, colormapLinear, 400, 20, {
  type: 'normal',
  // The position option determines where the axis ticks will be drawn.
  position: 'bottom',
  useGradients: false,
  title: 'Title [unit]',
})

// Create interpolated linear color bar from an SVGGElement.
const groupLinearInterpolated = getColourBarGroup('container-linear-interpolated')
new ColourBar(groupLinearInterpolated, colormapLinear, 400, 20, {
  type: 'normal',
  position: 'top',
  useGradients: true,
  // It is possible to specify the number of ticks.
  ticks: 6,
})

// Create non-interpolated non-linear color bar from a d3 selection.
const selectionNonLinearNonInterpolated = createColourBarGroup(
  'container-non-linear-non-interpolated',
)
new ColourBar(selectionNonLinearNonInterpolated, colormapNonLinear, 400, 20, {
  type: 'nonlinear',
  position: 'top',
  useGradients: false,
  // It is possible to explicitly specify tick values.
  // Note: the type of tickValues is incorrectly specified, so we need to cast
  //       it. See issue #136.
  tickValues: colormapNonLinear.map((entry) => entry.lowerValue) as [number],
})

// Create interpolated non-linear color bar from a d3 selection.
const selectionNonLinearInterpolated = createColourBarGroup('container-non-linear-interpolated')
new ColourBar(selectionNonLinearInterpolated, colormapNonLinear, 400, 20, {
  type: 'nonlinear',
  position: 'top',
  useGradients: true,
  // Note: the type of tickValues is incorrectly specified, so we need to cast
  //       it. See issue #136.
  tickValues: [0, 5, 10, 15] as unknown as [number],
})

// Create vertical color bar with ticks on the left from a d3 selection.
const selectionVerticalLeft = createColourBarGroup('container-vertical-left', false)
new ColourBar(selectionVerticalLeft, colormapLinear, 20, 400, {
  type: 'linear',
  position: 'left',
  useGradients: true,
  title: 'Title [unit]',
})

// Create vertical color bar with ticks on the right from a d3 selection.
const selectionVerticalRight = createColourBarGroup('container-vertical-right', false)
new ColourBar(selectionVerticalRight, colormapLinear, 20, 400, {
  type: 'linear',
  position: 'right',
  useGradients: true,
})
