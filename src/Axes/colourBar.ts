import { Property } from 'csstype'
import * as d3 from 'd3'
import { defaultsDeep } from 'lodash-es'
import { AxisPosition } from '../Axis/axisPosition.js'

/**
 * A single value in a colour map
 */
export interface ColourMapValue {
  /** The lower value of this segment */
  lowerValue: number
  /** Colour associated with this segment */
  color: Property.Color
}
export type ColourMap = ColourMapValue[]

/**
 * A single value in a colour map
 */
export interface ColourBarOptions {
  /** The lower value of this segment */
  useGradients: boolean;
  /** Colour associated with this segment */
  position: AxisPosition;
  title?: string;
  type: string;
  ticks?: number
  tickValues?: [number] | [Date]
}

type GroupSelection = d3.Selection<SVGElement, any, SVGElement, any>

/**
 * Generates a random (hopefully unique) ID
 *
 * @param length number of characters in the ID
 * @returns a random ID
 */
function generateRandomId(length: number) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const numCharacters = characters.length;
  let id = '';
  for (let i = 0; i < length; i++) {
    id += characters.charAt(Math.floor(Math.random() * numCharacters));
  }
  return id;
}

/**
 * A colour bar, e.g. as a legend for a heat map.
 */
export class ColourBar {
  group: GroupSelection
  colourMap: ColourMap
  width: number
  height: number
  options: ColourBarOptions
  scale: any

  /**
   * Creates a colour bar
   * @param group d3 selection of the SVG group to add the colour bar to
   * @param colourMap colour map to display
   * @param width width of the colour bar
   * @param height height of the colour bar
   * @param options colour bar options
   */
  constructor(
    group: GroupSelection | SVGGElement,
    colourMap: ColourMap,
    width: number,
    height: number,
    options: ColourBarOptions
  ) {
    this.group = group instanceof SVGGElement ? d3.select(group) : group
    this.colourMap = colourMap
    this.width = width
    this.height = height
    this.options = defaultsDeep({},
      options,
      {
        position: AxisPosition.Bottom,
        useGradients: true,
        type: 'normal'
      }
    )
    this.createScale()
    const fills = this.createFills()
    this.createBarSegments(fills)
    this.createAxis()
  }

  get numColours(): number {
    return this.colourMap.length
  }

  get minimum(): number {
    return this.colourMap[0].lowerValue
  }

  get maximum(): number {
    return this.colourMap[this.numColours - 1].lowerValue
  }

  get range(): number {
    return this.maximum - this.minimum
  }

  get sizeAlongAxis(): number {
    return this.isHorizontal ? this.width : this.height
  }

  get sizeAcrossAxis(): number {
    return this.isHorizontal ? this.height : this.width
  }

  get isHorizontal() {
    return this.options.position === AxisPosition.Bottom || this.options.position === AxisPosition.Top
  }

  /**
   * Generate fill colours for the colour bar elements.
   *
   * These can be either gradients or solid colours.
   */
  private createFills() {
    let fills = []
    if (this.options.useGradients) {
      // Add colour map gradients with unique IDs to <defs> element in this group.
      const ids = this.addColourMapGradients()
      // Refer to their IDs for each rectangle's fill colour
      fills = ids.map((id: string) => `url(#${id})`)
    } else {
      fills = this.colourMap.slice(0, this.colourMap.length - 1).map((val: ColourMapValue) => val.color)
    }
    return fills
  }

  /**
   * Defines gradients in the SVG for the specified colour map
   *
   * Ids are generated with a random prefix to prevent clashes when multiple colour bars are present.
   *
   * @returns Ids of the generated gradients.
   */
  private addColourMapGradients() {
    const numColours = this.colourMap.length

    const defs = this.group.append('defs')

    const ids = []
    const gradientIdPrefix = generateRandomId(8)
    for (let i = 0; i < numColours - 1; i++) {
      const idCur = `${gradientIdPrefix}_${i}`
      this.addGradient(defs, idCur, this.colourMap[i].color, this.colourMap[i + 1].color)
      ids.push(idCur)
    }
    return ids
  }

  private createScale() {
    const tickValues = this.colourMap.map((val: ColourMapValue) => val.lowerValue)
    const scale = d3.scaleLinear()
    if (this.options.type === 'nonlinear') {
      let range = tickValues.map((_d, i) => {
        return i * this.sizeAlongAxis / (tickValues.length - 1)
      })
      if (!this.isHorizontal) range = range.reverse()
      scale
        .domain(tickValues)
        .range(range)
    } else {
      scale
        .domain([this.minimum, this.maximum])
        .range(this.isHorizontal ? [0, this.sizeAlongAxis] : [this.sizeAlongAxis, 0])
    }
    this.scale = scale
  }


  /**
   * Creates rectangles for each segment of the colour bar.
   * @param fills colour values (or e.g. gradient references) for each segment
   */
  private createBarSegments(fills: string[]) {
    // Bounds of the colour map should be monotonically increasing.
    const startCoordinate =
      this.isHorizontal ? (lowerValue: number, _upperValue: number) => this.scale(lowerValue)
        : (_lowerValue: number, upperValue: number) => this.scale(upperValue)
    const barSize = (lowerValue: number, upperValue: number) => Math.abs(this.scale(upperValue) - this.scale(lowerValue))

    // Add rectangles for each segment of the colour bar.
    const barGroup = this.group.append('g')
    for (let i = 0; i < this.colourMap.length - 1; i++) {
      const lowerValue = this.colourMap[i].lowerValue
      const upperValue = this.colourMap[i + 1].lowerValue

      const posCur = startCoordinate(lowerValue, upperValue)
      const sizeCur = barSize(lowerValue, upperValue)
      barGroup.append('rect')
        .attr('x', this.isHorizontal ? posCur : 0)
        .attr('y', this.isHorizontal ? 0 : posCur)
        .attr('width', this.isHorizontal ? sizeCur : this.sizeAcrossAxis)
        .attr('height', this.isHorizontal ? this.sizeAcrossAxis : sizeCur)
        .attr('stroke', 'none')
        .attr('fill', fills[i])
        .attr('shape-rendering', 'crispEdges')
    }
  }

  /**
   * Creates the axis along the colour bar.
   */
  private createAxis() {
    // Add ticks along the colour bar.
    const axisTranslation = `translate(${this.options.position === AxisPosition.Right ? this.width : 0}, ${this.options.position === AxisPosition.Bottom ? this.height : 0})`
    const tickValues = this.colourMap.map((val: ColourMapValue) => val.lowerValue)

    // The y-axis is inverted in the SVG, so for vertical scale bars the range is inverted.
    const scale = this.scale
    const axis = this.initAxis(scale, this.options)

    if (this.options.tickValues) {
      axis.tickValues(this.options.tickValues)
    }
    else if (this.options.type === 'nonlinear') {
      const count = this.options.ticks ?? 5
      const stride = Math.round(tickValues.length / count)
      axis.tickValues(tickValues.filter((v, i) => { return i % stride === 0 }))
      axis.tickFormat((d) => d.toString())
    } else if (this.options.ticks) {
      axis.ticks(this.options.ticks)
    } else {
      axis.tickValues(tickValues)
      // axis.tickFormat((d) => d.toString())
    }

    const axisGroup = this.group.append('g')
      .attr('transform', axisTranslation)
      .attr('class', 'axis colourbar')
    axisGroup.call(axis)
    // Remove axis line, only leave the ticks
    axisGroup.select('path').remove()

    // Add grid lines across the colour bar.
    const gridTranslation = `translate(${this.isHorizontal ? 0 : this.width}, ${this.isHorizontal ? this.height : 0})`
    const gridGroup = this.group.append('g')
      .attr('class', 'grid colourbar')
      .attr('transform', gridTranslation)
    const grid = this.isHorizontal ? d3.axisTop(scale) : d3.axisLeft(scale)

    grid.tickValues(axis.tickValues())
    grid.tickSize(this.sizeAcrossAxis)
    gridGroup.call(grid)
    gridGroup.select('path').remove()
    gridGroup.selectAll('.tick').selectAll('text').remove()

    const g = this.group.append('g')
      .attr('class', 'title')
      .attr('font-family', 'sans-serif')

    if (this.options.title) {
      g.append('text')
        .attr('x', this.width / 2)
        .attr('y', -9)
        .attr('text-anchor', 'middle')
        .text(this.options.title)
    }
  }

  private initAxis(scale: any, options: ColourBarOptions) {
    switch (options.position) {
      case AxisPosition.Bottom:
        return d3.axisBottom(scale)
      case AxisPosition.Top:
        return d3.axisTop(scale)
      case AxisPosition.Right:
        return d3.axisRight(scale)
      case AxisPosition.Left:
      default:
        return d3.axisLeft(scale)
    }
  }

  /**
   * Adds a gradient definition to the SVG.
   *
   * Depending on the isHorizontal property, the gradient is created either
   * horizontally (isHorizontal = true) or vertically (isHorizontal = false).
   *
   * @param defs d3 selection of the <defs> tag in the SVG
   * @param id unique ID of the gradient
   * @param colorStart start colour of the gradient
   * @param colorEnd end colour of the gradient
   */
  private addGradient(defs: any, id: string, colorStart: Property.Color, colorEnd: Property.Color) {
    const gradient = defs.append('linearGradient')
      .attr('id', id)
      .attr('x1', this.isHorizontal ? '0%' : '100%')
      .attr('y1', this.isHorizontal ? '100%' : '0%')
      .attr('x2', '100%')
      .attr('y2', '100%')
    // Since the SVG y-axis inverted, for vertical colour bars the gradient should also be inverted.
    gradient.append('stop')
      .attr('offset', '0%')
      .attr('style', `stop-color:${this.isHorizontal ? colorStart : colorEnd};stop-opacity:1`)
    gradient.append('stop')
      .attr('offset', '100%')
      .attr('style', `stop-color:${this.isHorizontal ? colorEnd : colorStart};stop-opacity:1`)
  }
}
