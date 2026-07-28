import * as d3 from 'd3'
import { Axes } from '../Axes/axes.js'
import { AxisType, CartesianAxes, TooltipPosition } from '../index.js'
import { Visitor } from './visitor.js'
import { dateFormatter } from '../Utils/date.js'
import {
  calculateTooltipPlacement,
  getMouseOverDirectionStrategy,
  MouseOverDirectionStrategy,
} from '../Utils/index.js'

export enum MouseOverDirection {
  Horizontal = 'horizontal',
  Vertical = 'vertical',
}

interface MouseOverOptions {
  trace?: string[]
  numberFormatter?: (value: number, extent?: [number, number]) => string
  direction?: MouseOverDirection
}

interface ActiveChartContext {
  chart: CartesianAxes['charts'][number]
  xScale: any
  yScale: any
  inverseAxisIndex: number
}

export class MouseOver implements Visitor {
  private trace: string[] | undefined
  private group!: d3.Selection<SVGGElement, unknown, null, unknown>
  private axes!: CartesianAxes
  private mouseGroup!: d3.Selection<SVGGElement, unknown, null, unknown>
  private readonly customNumberFormatter:
    ((value: number, extent?: [number, number]) => string) | null
  private readonly direction: MouseOverDirection
  private isTouchLocked = false
  private lastPointerType: string | null = null
  private pendingMouse: [number, number] | null = null
  private frameId: number | null = null

  constructor(options: MouseOverOptions = {}) {
    this.setTrace(options.trace)
    this.customNumberFormatter = options.numberFormatter ?? null
    this.direction = options.direction ?? MouseOverDirection.Horizontal
  }

  setTrace(trace: string[] | undefined) {
    this.trace = trace
  }

  private directionStrategy(): MouseOverDirectionStrategy {
    return getMouseOverDirectionStrategy(this.direction)
  }

  private resolvedTraces(): string[] {
    return this.trace ?? this.axes.charts.map((chart) => chart.id)
  }

  private createMouseLinePath(width: number, height: number): string {
    return this.directionStrategy().createLinePath(width, height)
  }

  private setLineVisibility(visible: boolean): void {
    this.group.select('.mouse-line').style('opacity', visible ? '1' : '0')
  }

  private setValueLabelVisibility(visible: boolean): void {
    this.group
      .select(this.directionStrategy().valueLabelSelector)
      .style('fill-opacity', visible ? '1' : '0')
  }

  private updateGuideLineAndValue(mouse: [number, number]): void {
    if (this.direction === MouseOverDirection.Vertical) {
      this.updateYLine(mouse[1])
      this.updateYValue(mouse[1])
    } else {
      this.updateXLine(mouse[0])
      this.updateXValue(mouse[0])
    }
  }

  private tooltipBaseX(mouse: [number, number]): number {
    return this.directionStrategy().tooltipBaseX(mouse, this.axes.margin.left, this.lastPointerType)
  }

  private directionKeys(): { key: 'x' | 'y'; inverseKey: 'x' | 'y' } {
    const { key, inverseKey } = this.directionStrategy()
    return { key, inverseKey }
  }

  private pointerValue(mouse: [number, number], xScale: any, yScale: any): number | Date {
    return this.directionStrategy().pointerValue(mouse, xScale, yScale)
  }

  private buildTooltipContent(spanElements: HTMLSpanElement[]): HTMLElement {
    const htmlContent = document.createElement('div')
    for (const span of spanElements) {
      htmlContent.appendChild(span)
      htmlContent.appendChild(document.createElement('br'))
    }
    return htmlContent
  }

  private setChartsPointerState(traces: string[]): void {
    for (const chart of this.axes.charts) {
      if (traces.includes(chart.id)) {
        chart.onPointerOver()
      } else {
        chart.onPointerOut()
      }
    }
  }

  private forEachActiveTraceChart(callback: (context: ActiveChartContext) => void): void {
    const traces = this.resolvedTraces()
    const { inverseKey } = this.directionKeys()
    const seen = new Set<string>()

    for (const chart of this.axes.charts) {
      if (!traces.includes(chart.id) || !chart.visible || seen.has(chart.id)) {
        seen.add(chart.id)
        continue
      }

      const xAxisIndex = chart.axisIndex.x
      const yAxisIndex = chart.axisIndex.y
      const inverseAxis = chart.axisIndex[inverseKey]
      if (!xAxisIndex || !yAxisIndex || !inverseAxis) {
        seen.add(chart.id)
        continue
      }

      const xScale = this.axes.xScales[xAxisIndex.axisIndex]
      const yScale = this.axes.yScales[yAxisIndex.axisIndex]
      callback({ chart, xScale, yScale, inverseAxisIndex: inverseAxis.axisIndex })
      seen.add(chart.id)
    }
  }

  private collectTooltipSpans(mouse: [number, number]): HTMLSpanElement[] {
    const spans: HTMLSpanElement[] = []
    const { key, inverseKey } = this.directionKeys()

    this.forEachActiveTraceChart(({ chart, xScale, yScale, inverseAxisIndex }) => {
      const extent = this.axes.chartsExtent(inverseKey, inverseAxisIndex, {})
      const precision = d3.precisionFixed((extent[1] - extent[0]) / 100)
      const value = this.pointerValue(mouse, xScale, yScale)
      const pointData = chart.onPointerMove(value, key, xScale, yScale)
      const spanElement = chart.mouseOverFormatterCartesian(inverseKey, pointData, precision)
      if (spanElement) {
        spans.push(spanElement)
      }
    })

    return spans
  }

  private handlePointerMove(event: PointerEvent): void {
    this.lastPointerType = event.pointerType
    if (event.pointerType === 'touch' && !this.isTouchLocked) {
      return
    }
    if (event.pointerType === 'touch') {
      event.preventDefault()
    }
    const mouse = d3.pointer(event)
    this.scheduleUpdate(mouse)
  }

  private handleTouchPointerDown(event: PointerEvent): void {
    event.preventDefault()

    // Touch uses a tap-to-lock interaction so values remain readable during and after drag.
    if (this.isTouchLocked) {
      this.isTouchLocked = false
      this.onPointerout()
      return
    }

    this.isTouchLocked = true
    this.onPointerover()
    const mouse = d3.pointer(event)
    this.scheduleUpdate(mouse)
  }

  visit(axes: Axes): void {
    this.axes = axes as CartesianAxes
    this.create(axes as CartesianAxes)
  }

  create(axes: CartesianAxes): void {
    this.mouseGroup = axes.canvas.select('.mouse')
    // Make sure the <g> mouse group picks up pointer events.
    this.mouseGroup.attr('pointer-events', 'all').style('touch-action', 'none')
    this.mouseGroup.select('rect').style('touch-action', 'none')

    this.group = axes.canvas
      .insert('g', '.mouse')
      .attr('class', 'mouse-over')
      .attr('font-family', 'sans-serif')

    this.group
      .append('path')
      .attr('class', 'mouse-line')
      .style('opacity', '0')
      .attr('d', () => this.createMouseLinePath(axes.width, axes.height))

    if (this.direction === MouseOverDirection.Vertical) {
      this.group.append('g').attr('class', 'mouse-y').append('text').text('')
    } else {
      this.group
        .append('g')
        .attr('class', 'mouse-x')
        .attr('transform', `translate(0,${axes.height})`)
        .append('text')
        .text('')
    }

    this.mouseGroup
      .on('pointerdown', (event: PointerEvent) => this.onPointerdown(event))
      .on('pointerout', () => this.onPointerout())
      .on('pointerover', () => this.onPointerover())
      .on('pointermove', (event: PointerEvent) => this.handlePointerMove(event))
  }

  private scheduleUpdate(mouse: [number, number]): void {
    this.pendingMouse = mouse
    if (this.frameId !== null) {
      return
    }

    this.frameId = window.requestAnimationFrame(() => {
      this.frameId = null
      if (this.pendingMouse === null) {
        return
      }

      const nextMouse = this.pendingMouse
      this.pendingMouse = null
      this.update(nextMouse)
    })
  }

  private cancelScheduledUpdate(): void {
    if (this.frameId !== null) {
      window.cancelAnimationFrame(this.frameId)
      this.frameId = null
    }
    this.pendingMouse = null
  }

  onPointerdown(event: PointerEvent): void {
    this.lastPointerType = event.pointerType
    if (event.pointerType !== 'touch') {
      return
    }

    this.handleTouchPointerDown(event)
  }

  // pointer event handlers
  onPointerout(): void {
    if (this.isTouchLocked) {
      return
    }

    this.cancelScheduledUpdate()

    // on mouse out hide line and text
    this.setLineVisibility(false)
    this.setValueLabelVisibility(false)

    for (const chart of this.axes.charts) {
      chart.onPointerOut()
    }
    this.axes.tooltip.hide()
  }

  onPointerover(): void {
    if (this.lastPointerType === 'touch' && !this.isTouchLocked) {
      return
    }

    // on mouse in show line, circles and text
    this.axes.tooltip.show()
    this.setLineVisibility(true)
    const traces = this.resolvedTraces()
    this.setChartsPointerState(traces)
    this.setValueLabelVisibility(true)
  }

  updateChartIndicators(mouse: [number, number]): void {
    const spanElements = this.collectTooltipSpans(mouse)
    this.updateTooltip(spanElements, mouse)
  }

  update(mouse: [number, number]) {
    this.updateGuideLineAndValue(mouse)
    this.updateChartIndicators(mouse)
  }

  updateXLine(xPos: number) {
    this.group.select('.mouse-line').attr('transform', `translate(${xPos},0)`)
  }

  updateXValue(xPos: number) {
    const axes = this.axes
    const xText = this.xText(axes, xPos)
    const mouseXGroup = this.group.select('.mouse-x')
    const textSelection = mouseXGroup.select<SVGTextElement>('text').text(xText)
    const textNode = textSelection.node()
    const textWidth = textNode?.getComputedTextLength() ?? 0

    const rightOffset = 2
    const leftOffset = 2
    const spaceOnRight = axes.width - xPos - rightOffset
    const spaceOnLeft = xPos - leftOffset
    const useLeftSide = textWidth > spaceOnRight && spaceOnLeft > spaceOnRight

    textSelection.attr('text-anchor', useLeftSide ? 'end' : 'start')
    mouseXGroup.attr(
      'transform',
      `translate(${useLeftSide ? xPos - leftOffset : xPos + rightOffset},${axes.height - 5})`,
    )
  }

  updateYLine(yPos: number) {
    this.group.select('.mouse-line').attr('transform', `translate(0,${yPos})`)
  }

  updateYValue(yPos: number) {
    const axes = this.axes
    const yText = this.yText(axes, yPos)
    const mouseYGroup = this.group.select('.mouse-y')
    const textSelection = mouseYGroup.select<SVGTextElement>('text').text(yText)
    const textNode = textSelection.node()
    const textWidth = textNode?.getComputedTextLength() ?? 0

    const leftOffset = 2
    const rightOffset = 2
    const useRightSide = textWidth > axes.width - leftOffset
    const x = useRightSide ? axes.width - rightOffset : leftOffset

    textSelection
      .attr('text-anchor', useRightSide ? 'end' : 'start')
      .attr('dominant-baseline', 'hanging')
    mouseYGroup.attr('transform', `translate(${x},${yPos + 2})`)
  }

  updateTooltip(spanElements: HTMLSpanElement[], mouse: [number, number]) {
    const axes = this.axes
    if (spanElements.length === 0) {
      axes.tooltip.hide()
    } else {
      const htmlContent = this.buildTooltipContent(spanElements)

      const baseX = this.tooltipBaseX(mouse)

      // Keep tooltip y anchored to the current guide-line position.
      const baseY = mouse[1] + axes.margin.top

      const defaultPosition = this.directionStrategy().defaultTooltipPosition

      // First render updates tooltip content so dimensions can be measured for edge-aware placement.
      axes.tooltip.update(htmlContent, defaultPosition, baseX, baseY)
      const placement = this.getEdgeAwareTooltipPlacement(baseX, baseY, defaultPosition)
      axes.tooltip.update(htmlContent, placement.position, placement.x, placement.y)
      if (axes.tooltip.isHidden) {
        axes.tooltip.show()
      }
    }
  }

  private getEdgeAwareTooltipPlacement(
    x: number,
    y: number,
    preferredPosition: TooltipPosition,
  ): { x: number; y: number; position: TooltipPosition } {
    const containerWidth = this.axes.container.clientWidth
    const containerHeight = this.axes.container.clientHeight
    const tooltipNode = this.axes.tooltip.tooltipText?.node() as HTMLElement | null
    const rect = tooltipNode?.getBoundingClientRect()

    const tooltipWidth = rect?.width ?? 160
    const tooltipHeight = rect?.height ?? 48

    return calculateTooltipPlacement({
      x,
      y,
      preferredPosition,
      containerWidth,
      containerHeight,
      tooltipWidth,
      tooltipHeight,
    })
  }

  private xText(axes: CartesianAxes, xPos: number): string {
    if (axes.options.x[0].type === AxisType.time) {
      return dateFormatter(axes.xScales[0].invert(xPos), 'yyyy-MM-dd HH:mm ZZZZ', {
        timeZone: axes.options.x[0].timeZone,
        locale: axes.options.x[0].locale,
      })
    } else {
      const s = d3.formatSpecifier('f')
      const xDomain = axes.xScales[0].domain()
      s.precision = d3.precisionFixed(xDomain[1] / 100)

      // Pass the x-domain as the extent for the formatting.
      const customFormatter = this.customNumberFormatter
      const formatNumber =
        customFormatter !== null
          ? (value: number) => customFormatter(value, xDomain as [number, number])
          : d3.format(s.toString())
      return formatNumber(axes.xScales[0].invert(xPos))
    }
  }

  private yText(axes: CartesianAxes, yPos: number): string {
    if (axes.options.y[0].type === AxisType.time) {
      return dateFormatter(axes.yScales[0].invert(yPos), 'yyyy-MM-dd HH:mm ZZZZ', {
        timeZone: axes.options.y[0].timeZone,
        locale: axes.options.y[0].locale,
      })
    } else {
      const s = d3.formatSpecifier('f')
      const yDomain = axes.yScales[0].domain()
      s.precision = d3.precisionFixed(yDomain[1] / 100)

      const customFormatter = this.customNumberFormatter
      const formatNumber =
        customFormatter !== null
          ? (value: number) => customFormatter(value, yDomain as [number, number])
          : d3.format(s.toString())

      return formatNumber(axes.yScales[0].invert(yPos))
    }
  }

  redraw(): void {
    this.cancelScheduledUpdate()
    this.isTouchLocked = false
    this.lastPointerType = null

    this.group
      .select('.mouse-line')
      .attr('d', () => this.createMouseLinePath(this.axes.width, this.axes.height))
    for (const chart of this.axes.charts) {
      chart.onPointerOut()
    }
  }
}
