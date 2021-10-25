import { Color } from 'csstype'
import * as d3 from 'd3'
import defaultsDeep from 'lodash/defaultsDeep'
import { AxisPosition } from '../Types/axisPosition'

/**
 * A single value in a colour map
 */
export interface ColourMapValue {
  /** The lower value of this segment */
  lowerValue: number
  /** Colour associated with this segment */
  color: Color
}
export type ColourMap = ColourMapValue[]

/**
 * A single value in a colour map
 */
 export interface ColourBarOptions {
  /** The lower value of this segment */
  useGradients: boolean
  /** Colour associated with this segment */
  position: AxisPosition
}

type GroupSelection = d3.Selection<SVGElement, any, SVGElement, any>

/**
 * Generates a random (hopefully unique) ID
 *
 * TODO: some UUID rather than this...
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

  /**
   * Creates a colour bar
   * @param group d3 selection of the SVG group to add the colour bar to
   * @param colourMap colour map to display
   * @param width width of the colour bar
   * @param height height of the colour bar
   * @param options colour bar options
   */
  constructor(
    group: GroupSelection,
    colourMap: ColourMap,
    width: number,
    height: number,
    options: ColourBarOptions
  ) {
    this.group = group
    this.colourMap = colourMap
    this.width = width
    this.height = height
    this.options = defaultsDeep({},
      options,
      {
        position: AxisPosition.Bottom,
        useGradients: true
      }
    )
    console.log(this.options)
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

  get sizeAlongAxis() : number {
    return this.isHorizontal ? this.width : this.height
  }

  get sizeAcrossAxis() : number {
    return this.isHorizontal ? this.height : this.width
  }

  get isHorizontal () {
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
      this.addGradient(defs, idCur, this.colourMap[i].color, this.colourMap[i+1].color)
      ids.push(idCur)
    }
    return ids
  }

  /**
   * Creates rectangles for each segment of the colour bar.
   * @param fills colour values (or e.g. gradient references) for each segment
   */
  private createBarSegments(fills: string[]) {
    // Bounds of the colour map should be monotonically increasing.
    const minimum = this.colourMap[0].lowerValue
    const maximum = this.colourMap[this.colourMap.length - 1].lowerValue
    const range = maximum - minimum
    const relativeLocation = (value: number) => (value - minimum) / range
    const relativeToCoordinates = (relative: number) => relative * this.sizeAlongAxis

    // Add rectangles for each segment of the colour bar.
    const barGroup = this.group.append('g')
    for (let i = 0; i < this.colourMap.length - 1; i++) {
      const posCur = relativeLocation(this.colourMap[i].lowerValue)
      const posNext = relativeLocation(this.colourMap[i+1].lowerValue)
      const relativeSize = posNext - posCur

      const locCur = relativeToCoordinates(posCur)
      const sizeCur = relativeToCoordinates(relativeSize)
      barGroup.append('rect')
        .attr('x', this.isHorizontal ? locCur : 0)
        .attr('y', this.isHorizontal ? 0 : locCur)
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

    const scale = d3.scaleLinear()
      .domain([this.minimum, this.maximum])
      .range([0, this.sizeAlongAxis])
    const axis =
      this.options.position === AxisPosition.Bottom ? d3.axisBottom(scale) :
      this.options.position === AxisPosition.Top ? d3.axisTop(scale) :
      this.options.position === AxisPosition.Right ? d3.axisRight(scale) :
      d3.axisLeft(scale)

    axis.tickValues(tickValues)
    const axisGroup = this.group.append('g')
      .attr('transform', axisTranslation)
      .attr('class', 'axis colourbar')
    axisGroup.call(axis)
    // Remove axis line, only leave the ticks
    axisGroup.select('path').remove()

    // Add grid lines across the colour bar.
    const gridTranslation = `translate(${this.isHorizontal ? 0 : this.width}, ${this.isHorizontal ? this.height : 0 })`
    const gridGroup = this.group.append('g')
      .attr('class', 'grid colourbar')
      .attr('transform', gridTranslation)
    const grid = this.isHorizontal ? d3.axisTop(scale) : d3.axisLeft(scale)
    grid.tickValues(tickValues).tickSize(this.sizeAcrossAxis)
    gridGroup.call(grid)
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
  private addGradient(defs: any, id: string, colorStart: Color, colorEnd: Color) {
    const gradient = defs.append('linearGradient')
      .attr('id', id)
      .attr('x1', this.isHorizontal ? '0%' : '100%')
      .attr('y1', this.isHorizontal ? '100%' : '0%')
      .attr('x2', '100%')
      .attr('y2', '100%')
    gradient.append('stop')
      .attr('offset', '0%')
      .attr('style', `stop-color:${colorStart};stop-opacity:1`)
    gradient.append('stop')
      .attr('offset', '100%')
      .attr('style', `stop-color:${colorEnd};stop-opacity:1`)
  }
}
