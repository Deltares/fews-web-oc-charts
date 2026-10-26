import type { CompositeStyle } from '../marks/composite.js'
import { svgElement } from '../axes/render-axes.js'
import { resolveCompositeStyle } from '../marks/mark-styles.js'
import type { ThemeTokens } from '../../theme/theme.js'

export interface CanvasShape {
  readonly layerId: string
  readonly path: Path2D
}

const surfaces = new WeakMap<
  SVGGElement,
  { canvas: HTMLCanvasElement; foreign: SVGForeignObjectElement; shapes: readonly CanvasShape[] }
>()

export function renderCompositeCanvas(group: SVGGElement, shapes: readonly CanvasShape[]) {
  let surface = surfaces.get(group)
  if (!surface) {
    const foreign = svgElement('foreignObject', { 'data-renderer': 'canvas' })
    const canvas = document.createElement('canvas')
    canvas.style.display = 'block'
    foreign.append(canvas)
    group.replaceChildren(foreign)
    surface = { canvas, foreign, shapes }
    surfaces.set(group, surface)
  }
  surface.shapes = shapes
  const svg = group.ownerSVGElement
  if (!svg) throw new Error('Canvas marks require an SVG plot.')
  const width = svg.width.baseVal.value
  const height = svg.height.baseVal.value
  const ratio = window.devicePixelRatio || 1
  surface.canvas.width = Math.ceil(width * ratio)
  surface.canvas.height = Math.ceil(height * ratio)
  surface.canvas.style.width = `${width}px`
  surface.canvas.style.height = `${height}px`
  surface.foreign.setAttribute('width', String(width))
  surface.foreign.setAttribute('height', String(height))
}

export function clearCompositeCanvas(group: SVGGElement) {
  const surface = surfaces.get(group)
  if (!surface) return
  surface.canvas.width = 0
  surface.canvas.height = 0
  surfaces.delete(group)
  group.replaceChildren()
}

export function styleCompositeCanvas(
  group: SVGGElement,
  layers: ReadonlyMap<string, CompositeStyle>,
  options: CompositeStyle,
  tokens: ThemeTokens,
): boolean {
  const surface = surfaces.get(group)
  if (!surface) return false
  const context = surface.canvas.getContext('2d')
  if (!context) throw new Error('Canvas marks require a 2D rendering context.')
  const ratio = window.devicePixelRatio || 1
  context.resetTransform()
  context.clearRect(0, 0, surface.canvas.width, surface.canvas.height)
  context.scale(ratio, ratio)
  // Resolve CSS variables/currentColor through SVG, just as the SVG renderer does.
  const probe = svgElement('rect', { visibility: 'hidden' })
  group.append(probe)
  try {
    const styles = new Map<
      string,
      { fill: string; stroke: string; opacity: number; width: number }
    >()
    for (const [id, layer] of layers) {
      const style = resolveCompositeStyle(layer, options, tokens)
      probe.setAttribute('fill', style.fill)
      probe.setAttribute('stroke', style.stroke)
      const computed = getComputedStyle(probe)
      styles.set(id, {
        fill: computed.fill,
        stroke: computed.stroke,
        opacity: style.opacity,
        width: style.strokeWidth,
      })
    }
    for (const shape of surface.shapes) {
      const style = styles.get(shape.layerId)
      if (!style) throw new Error('Missing composite layer for canvas geometry.')
      const { fill, stroke, opacity, width } = style
      if (fill !== 'none') {
        context.globalAlpha = opacity
        context.fillStyle = fill
        context.fill(shape.path)
      }
      if (stroke !== 'none' && width > 0) {
        context.globalAlpha = 1
        context.strokeStyle = stroke
        context.lineWidth = width
        context.stroke(shape.path)
      }
    }
  } finally {
    probe.remove()
  }
  return true
}

export function watchCanvasPixelRatio(changed: () => void): () => void {
  let media: MediaQueryList
  const update = () => {
    media?.removeEventListener('change', update)
    media = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
    media.addEventListener('change', update)
    changed()
  }
  update()
  return () => media.removeEventListener('change', update)
}
