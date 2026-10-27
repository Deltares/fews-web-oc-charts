import { reactive } from '../../../core/runtime.js'
import type { PluginDefinition, PlotContext } from '../plugin-definition.js'
import {
  isCrosshairHandle,
  validateCrosshairUpdates,
  type CrosshairHandle,
  type CrosshairSnapOptions,
  type CrosshairOptions,
} from './crosshair.js'
import type { ScaleHandle } from '../../../scales/scale.js'
import type { Orientation } from '../../marks/mark-definition.js'
import { displayInspectionValue } from '../../interaction/inspection.js'
import { svgElement } from '../../rendering/svg.js'
import { barLayers, isBarMark } from '../../marks/bar/bar.js'
import { isStackedAreaMark } from '../../marks/stacked-area/stacked-area.js'
import { histogramBar, isHistogramMark } from '../../marks/histogram/histogram.js'
import {
  publishSharedPointer,
  releaseSharedPointer,
  type SharedPointer,
} from '../../../sync/shared-pointer.js'

interface CrosshairCallout {
  readonly group: SVGGElement
  readonly background: SVGRectElement
  readonly text: SVGTextElement
  measuredText: string | undefined
  measuredTheme: object | undefined
}

function validateSnapTarget(
  snap: CrosshairSnapOptions | undefined,
  marks: readonly object[],
  scales: Readonly<Record<string, ScaleHandle>>,
  direction: (name: string) => Orientation,
) {
  if (!snap) return
  if (!marks.includes(snap.mark)) {
    throw new Error('crosshair.snap.mark must be included in plot.marks.')
  }
  if (!Object.hasOwn(scales, snap.mark.x) || !Object.hasOwn(scales, snap.mark.y)) {
    throw new Error('crosshair.snap.mark references a missing scale.')
  }
  if (direction(snap.mark.x) !== 'x' || direction(snap.mark.y) !== 'y') {
    throw new Error('crosshair.snap.mark requires Cartesian x and y scales.')
  }
}

function validateLabels(
  options: Readonly<CrosshairOptions>,
  context: {
    readonly scales: Readonly<Record<string, unknown>>
    direction(this: void, name: string): Orientation
  },
) {
  for (const axis of ['x', 'y'] as const) {
    const name = options.labels?.[axis]
    if (name && (!Object.hasOwn(context.scales, name) || context.direction(name) !== axis)) {
      throw new Error(`crosshair.labels.${axis} requires a ${axis}-direction scale.`)
    }
  }
}

function installCrosshair(handle: CrosshairHandle, context: PlotContext) {
  const layer = svgElement('g', {
    'data-layer': 'crosshair',
    'pointer-events': 'none',
    'aria-hidden': 'true',
    display: 'none',
  })
  const vertical = svgElement('line', {
    'data-crosshair-axis': 'x',
    stroke: 'currentColor',
    'stroke-opacity': 0.65,
    'stroke-dasharray': '3 3',
    'vector-effect': 'non-scaling-stroke',
  })
  const horizontal = svgElement('line', {
    'data-crosshair-axis': 'y',
    stroke: 'currentColor',
    'stroke-opacity': 0.65,
    'stroke-dasharray': '3 3',
    'vector-effect': 'non-scaling-stroke',
  })
  layer.append(vertical, horizontal)
  const layerGuides = svgElement('g', { 'data-crosshair-layers': '' })
  const callouts = svgElement('g', { 'data-crosshair-labels': '' })
  const guideNodes = new Map<string, SVGLineElement>()
  const calloutNodes = new Map<string, CrosshairCallout>()
  layer.append(layerGuides, callouts)
  context.element.append(layer)

  function layerGuideIds(snap: CrosshairOptions['snap']) {
    if (snap?.axis !== 'x') return []
    if (isBarMark(snap.mark)) {
      const options = snap.mark.options.get().resolved
      if (options.orientation !== 'vertical') return []
      return barLayers(options)
        .filter((candidate) => candidate.visible !== false)
        .map((candidate) => candidate.id)
    }
    if (isHistogramMark(snap.mark)) {
      const options = histogramBar(snap.mark).options.get().resolved
      if (options.orientation !== 'vertical') return []
      return barLayers(options)
        .filter((candidate) => candidate.visible !== false)
        .map((candidate) => candidate.id)
    }
    if (isStackedAreaMark(snap.mark)) {
      return snap.mark.options
        .get()
        .resolved.layers.filter((candidate) => candidate.visible !== false)
        .map((candidate) => candidate.id)
    }
    return []
  }

  function calloutKey(axis: 'x' | 'y', layerId: string | undefined) {
    return JSON.stringify([axis, layerId ?? null])
  }

  function createCallout(axis: 'x' | 'y', layerId: string | undefined): CrosshairCallout {
    const group = svgElement('g', { 'data-crosshair-label': axis })
    if (layerId !== undefined) group.dataset.crosshairLayer = layerId
    const background = svgElement('rect', {
      rx: 3,
      stroke: 'currentColor',
      'stroke-opacity': 0.4,
    })
    const text = svgElement('text', {
      x: 6,
      'dominant-baseline': 'central',
    })
    group.append(background, text)
    callouts.append(group)
    return { group, background, text, measuredText: undefined, measuredTheme: undefined }
  }

  const validateOptions = (options: Readonly<CrosshairOptions>) => {
    const current = context.options.get().resolved
    validateSnapTarget(options.snap, current.marks, current.scales, context.direction)
    validateLabels(options, context)
  }
  const stopValidation = validateCrosshairUpdates(handle, validateOptions)
  validateOptions(handle.options.get().resolved)

  const source = Symbol('crosshair pointer source')
  let shared: SharedPointer | undefined
  let bindings: { name: string; scale: ScaleHandle; direction: string }[] = []
  let disconnect = () => {}
  context.scope.run(() => {
    reactive.onDispose(() => disconnect())
    reactive.effect(() => {
      const next = handle.options.get().resolved.pointer
      const entries = Object.entries(context.options.get().resolved.scales).map(
        ([name, scale]) => ({
          name,
          scale,
          direction: context.direction(name),
        }),
      )
      if (
        next === shared &&
        entries.length === bindings.length &&
        entries.every(
          (entry, index) =>
            entry.name === bindings[index].name &&
            entry.scale === bindings[index].scale &&
            entry.direction === bindings[index].direction,
        )
      )
        return
      disconnect()
      shared = next
      bindings = entries
      if (!next) {
        disconnect = () => {}
        return
      }
      const stop = context.onPointer((pointer) => {
        if (handle.options.get().resolved.pointer !== next) return
        const currentScales = context.options.get().resolved.scales
        const values = pointer.inside
          ? entries.flatMap(({ name, scale, direction }) => {
              const value = pointer.x.get(name)
              return currentScales[name] === scale &&
                context.direction(name) === direction &&
                next.by.includes(direction) &&
                value !== undefined
                ? [{ scale, value }]
                : []
            })
          : []
        publishSharedPointer(next, source, values)
      })
      disconnect = () => {
        stop()
        releaseSharedPointer(next, source)
      }
    })
  })

  context.scope.run(() =>
    reactive.effect(() => {
      if (context.suspended.get()) return
      const inspection = context.inspectCrosshair(handle)
      const mode = inspection.axes
      const region = context.regions.get().plot
      const visible = inspection.visible
      const x = inspection.point.x - region.x
      const y = inspection.point.y - region.y
      layer.setAttribute('transform', `translate(${region.x} ${region.y})`)
      layer.setAttribute('display', visible ? '' : 'none')

      vertical.setAttribute('x1', String(x))
      vertical.setAttribute('x2', String(x))
      vertical.setAttribute('y1', '0')
      vertical.setAttribute('y2', String(region.height))
      vertical.setAttribute('display', visible && mode.includes('x') ? '' : 'none')

      horizontal.setAttribute('x1', '0')
      horizontal.setAttribute('x2', String(region.width))
      horizontal.setAttribute('y1', String(y))
      horizontal.setAttribute('y2', String(y))
      horizontal.setAttribute(
        'display',
        visible && mode.includes('y') && !inspection.layers.length ? '' : 'none',
      )
      const guideIds = layerGuideIds(inspection.options.snap)
      const guideSet = new Set(guideIds)
      for (const [id, node] of guideNodes) {
        if (guideSet.has(id)) continue
        node.remove()
        guideNodes.delete(id)
      }
      for (const node of guideNodes.values()) node.setAttribute('display', 'none')
      if (visible) {
        for (const guide of inspection.layers) {
          const py = String(guide.py - region.y)
          let node = guideNodes.get(guide.hit.layerId)
          if (!node) {
            node = svgElement('line', {
              'data-crosshair-axis': 'y',
              'data-crosshair-layer': guide.hit.layerId,
              stroke: 'currentColor',
              'stroke-opacity': 0.65,
              'stroke-dasharray': '3 3',
              'vector-effect': 'non-scaling-stroke',
            })
            guideNodes.set(guide.hit.layerId, node)
            layerGuides.append(node)
          }
          node.setAttribute('x1', '0')
          node.setAttribute('x2', String(region.width))
          node.setAttribute('y1', py)
          node.setAttribute('y2', py)
          node.setAttribute('display', '')
        }
      }
      const layerCallouts = !!inspection.options.labels?.y && guideIds.length > 0
      const allowedCallouts = new Set<string>()
      if (inspection.options.labels?.x) allowedCallouts.add(calloutKey('x', undefined))
      if (inspection.options.labels?.y) {
        if (layerCallouts) {
          for (const id of guideIds) allowedCallouts.add(calloutKey('y', id))
        } else {
          allowedCallouts.add(calloutKey('y', undefined))
        }
      }
      for (const [key, nodes] of calloutNodes) {
        if (allowedCallouts.has(key)) continue
        nodes.group.remove()
        calloutNodes.delete(key)
      }
      for (const nodes of calloutNodes.values()) nodes.group.setAttribute('display', 'none')
      const activeCallouts = new Set<string>()
      const theme = context.theme.get()
      const height = theme.fontSize + 10
      for (const coordinate of inspection.coordinates) {
        if (coordinate.layerId !== undefined && !guideSet.has(coordinate.layerId)) continue
        const key = calloutKey(coordinate.axis, coordinate.layerId)
        let nodes = calloutNodes.get(key)
        if (!nodes) {
          nodes = createCallout(coordinate.axis, coordinate.layerId)
          calloutNodes.set(key, nodes)
        }
        activeCallouts.add(key)
        nodes.group.setAttribute('display', '')
        const text = displayInspectionValue(
          coordinate.value,
          context,
          coordinate.scale,
          coordinate.digits,
        )
        if (nodes.text.textContent !== text) nodes.text.textContent = text
        if (nodes.measuredText !== text || nodes.measuredTheme !== theme) {
          nodes.background.setAttribute('fill', theme.tooltipBackground)
          nodes.text.setAttribute('fill', theme.tooltipColor)
          nodes.text.setAttribute('font-family', theme.fontFamily)
          nodes.text.setAttribute('font-size', String(theme.fontSize))
          nodes.text.setAttribute('y', String(height / 2))
          nodes.background.setAttribute('width', String(nodes.text.getComputedTextLength() + 12))
          nodes.background.setAttribute('height', String(height))
          nodes.measuredText = text
          nodes.measuredTheme = theme
        }
        const width = Number(nodes.background.getAttribute('width'))
        const size = context.size.get()
        const left = coordinate.axis === 'x' ? x - width / 2 : -width
        const top =
          coordinate.axis === 'x' ? region.height : coordinate.position - region.y - height / 2
        const clampedX = Math.max(-region.x, Math.min(size.width - region.x - width, left))
        const clampedY = Math.max(-region.y, Math.min(size.height - region.y - height, top))
        nodes.group.setAttribute('transform', `translate(${clampedX} ${clampedY})`)
      }
      for (const [key, nodes] of calloutNodes) {
        if (!activeCallouts.has(key)) nodes.group.setAttribute('display', 'none')
      }
    }),
  )

  return {
    destroy() {
      stopValidation()
      layer.remove()
    },
  }
}

export const crosshairDefinition: PluginDefinition<CrosshairHandle> = {
  name: 'crosshair',
  is: isCrosshairHandle,
  validate(handle, context) {
    if (context.coordinateSystem !== 'cartesian') {
      throw new Error('The crosshair plugin currently supports Cartesian plots only.')
    }
    if (context.plugins.filter((plugin) => isCrosshairHandle(plugin)).length > 1) {
      throw new Error('A plot can install at most one crosshair plugin.')
    }
    const snap = handle.options.get().resolved.snap
    validateSnapTarget(snap, context.marks, context.scales, context.direction)
    validateLabels(handle.options.get().resolved, context)
  },
  install: installCrosshair,
}
