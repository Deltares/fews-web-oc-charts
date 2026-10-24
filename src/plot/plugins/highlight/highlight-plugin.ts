import { reactive } from '../../../core/runtime.js'
import { svgElement } from '../../rendering/svg.js'
import { markDefinition } from '../../marks/marks.js'
import type { HighlightShape } from '../../marks/mark-definition.js'
import type { PluginDefinition, PlotContext } from '../plugin-definition.js'
import { markColor, selectHoverHits } from '../hover-hits.js'
import {
  isHighlightHandle,
  validateHighlightUpdates,
  type HighlightHandle,
  type HighlightMark,
  type HighlightOptions,
} from './highlight.js'

let nextHighlightId = 0

function shapeElement(shape: HighlightShape): SVGElement {
  const stroke = shape.stroke ?? 'none'
  switch (shape.type) {
    case 'circle':
      return svgElement('circle', {
        cx: shape.cx,
        cy: shape.cy,
        r: shape.r,
        fill: shape.fill,
        stroke,
      })
    case 'rect':
      return svgElement('rect', {
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
        fill: shape.fill ?? 'none',
        stroke,
      })
    case 'path':
      return svgElement('path', { d: shape.d, fill: shape.fill ?? 'none', stroke })
  }
}

function installHighlight(handle: HighlightHandle, context: PlotContext) {
  validateTargets(
    handle.options.get().resolved.marks,
    context.options.get().resolved.marks,
    context,
  )
  const clipId = `fews-highlight-clip-${nextHighlightId++}`
  const layer = svgElement('g', {
    'data-layer': 'highlight',
    'pointer-events': 'none',
    'aria-hidden': 'true',
  })
  // Theme hook for the outline color of highlighted bars, areas and cells.
  layer.style.color = 'var(--fews-chart-highlight, currentColor)'
  const clipPath = svgElement('clipPath', { id: clipId })
  const clipRect = svgElement('rect')
  clipPath.append(clipRect)
  const shapes = svgElement('g', { 'clip-path': `url(#${clipId})` })
  layer.append(clipPath, shapes)
  // Appended last so the plot's own layer reordering keeps it above marks, like v4's front layer.
  context.element.append(layer)
  let pathContext: CanvasRenderingContext2D | undefined

  const stopValidation = validateHighlightUpdates(handle, (options) => {
    validateTargets(options.marks, context.options.get().resolved.marks, context)
    validateCrosshair(options, context.options.get().resolved.plugins)
  })

  try {
    context.scope.run(() =>
      reactive.effect(() => {
        const region = context.regions.get().plot
        clipRect.setAttribute('x', String(region.x))
        clipRect.setAttribute('y', String(region.y))
        clipRect.setAttribute('width', String(Math.max(0, region.width)))
        clipRect.setAttribute('height', String(Math.max(0, region.height)))
        const { hits } = selectHoverHits(
          handle.options.get().resolved,
          context,
          {
            marks: context.options.get().resolved.marks,
            pointer: context.pointer.get(),
            region,
          },
          () => (pathContext ??= document.createElement('canvas').getContext('2d') ?? undefined),
        )
        const nodes = hits.flatMap(({ mark, hit }) =>
          (
            markDefinition(mark).highlight?.(mark, hit, {
              scales: context.scales,
              color: markColor(mark, hit),
            }) ?? []
          ).map((shape) => {
            const node = shapeElement(shape)
            node.setAttribute('data-highlight', markDefinition(mark).name)
            return node
          }),
        )
        shapes.replaceChildren(...nodes)
        layer.setAttribute('display', nodes.length ? '' : 'none')
      }),
    )
  } catch (error) {
    stopValidation()
    layer.remove()
    throw error
  }

  return {
    destroy() {
      stopValidation()
      layer.remove()
    },
  }
}

function validateCrosshair(options: Readonly<HighlightOptions>, plugins: readonly object[]) {
  if (options.crosshair && !plugins.includes(options.crosshair)) {
    throw new Error('highlight.crosshair must be included in plot.plugins.')
  }
}

function validateTargets(
  targets: readonly HighlightMark[] | undefined,
  marks: readonly object[],
  context: {
    readonly scales: Readonly<Record<string, unknown>>
    direction(name: string): string
  },
) {
  if (!targets) return
  for (const mark of targets) {
    if (!marks.includes(mark)) {
      throw new Error('highlight.marks must be included in plot.marks.')
    }
    if (!Object.hasOwn(context.scales, mark.x) || !Object.hasOwn(context.scales, mark.y)) {
      throw new Error('highlight.marks references a missing scale.')
    }
    if (context.direction(mark.x) !== 'x' || context.direction(mark.y) !== 'y') {
      throw new Error('highlight.marks requires Cartesian x and y scales.')
    }
  }
}

export const highlightDefinition: PluginDefinition<HighlightHandle> = {
  name: 'highlight',
  is: isHighlightHandle,
  validate(handle, context) {
    if (context.coordinateSystem !== 'cartesian') {
      throw new Error('The highlight plugin currently supports Cartesian plots only.')
    }
    if (context.plugins.filter(isHighlightHandle).length > 1) {
      throw new Error('A plot can install at most one highlight plugin.')
    }
    validateTargets(handle.options.get().resolved.marks, context.marks, context)
    validateCrosshair(handle.options.get().resolved, context.plugins)
  },
  install: installHighlight,
}
