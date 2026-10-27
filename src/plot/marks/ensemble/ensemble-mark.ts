import type { EnsembleStatistic, EnsembleStore } from '../../../data-store/ensemble.js'
import type { ScaleBinding } from '../../../scales/scale.js'
import type { ThemeTokens } from '../../../theme/theme.js'
import { resolveMarkColor } from '../../../theme/color-contrast.js'
import { svgElement } from '../../axes/render-axes.js'
import {
  clearCompositeCanvas,
  renderCompositeCanvas,
  styleCompositeCanvas,
  type CanvasShape,
} from '../../rendering/render-composite-canvas.js'
import type { CompositeStyle } from '../composite.js'
import type { SymbolPrimitiveSpec, SymbolSpec } from '../../plugins/legend/legend.js'
import { ensembleHits, isEnsembleHit } from '../../interaction/ensemble-hit-testing.js'
import {
  accent,
  createKeyCache,
  extentWindow,
  scaleKey,
  setMarkId,
  type HighlightShape,
  type MarkDefinition,
  type MarkHit,
  type MarkLegend,
  type MarkRenderContext,
  type MarkRenderer,
  type MarkValidationContext,
} from '../mark-definition.js'
import {
  controlMemberIndex,
  isEnsembleMark,
  validateEnsembleUpdates,
  type EnsembleLineOptions,
  type EnsembleMark,
  type EnsembleOptions,
} from './ensemble.js'
import {
  drawnMemberCount,
  ensembleParts,
  ensembleStatistics,
  isPartVisible,
  spreadBands,
  visibleParts,
  type EnsemblePart,
} from './ensemble-parts.js'

type Window = readonly [number, number]

export function resolveEnsembleStyles(options: Readonly<EnsembleOptions>, tokens: ThemeTokens) {
  const line = (part: false | EnsembleLineOptions, stroke: string, width: number) => ({
    stroke: resolveMarkColor(part === false ? stroke : (part.stroke ?? stroke), tokens),
    strokeWidth: part === false ? width : (part.width ?? width),
    strokeDasharray: part === false ? undefined : part.strokeDasharray,
  })
  const members = options.members === false ? {} : options.members
  const spread = options.spread === false ? {} : options.spread
  return {
    members: {
      stroke: resolveMarkColor(members.stroke ?? accent(tokens), tokens),
      strokeWidth: members.width ?? 1,
      opacity: members.opacity ?? 0.25,
    },
    spread: {
      fill: resolveMarkColor(spread.fill ?? accent(tokens), tokens),
      opacity: spread.opacity ?? 0.2,
    },
    median: line(options.median, tokens.foreground, 2),
    mean: {
      ...line(options.mean, tokens.foreground, 1.5),
      strokeDasharray: (options.mean && options.mean.strokeDasharray) || '6 3',
    },
    control: line(options.control, accent(tokens), 2),
  }
}

function partSymbol(
  part: EnsemblePart,
  styles: ReturnType<typeof resolveEnsembleStyles>,
): SymbolPrimitiveSpec {
  if (part === 'spread') return { type: 'area', ...styles.spread }
  if (part === 'members') {
    return {
      type: 'line',
      stroke: styles.members.stroke,
      strokeWidth: styles.members.strokeWidth,
      opacity: styles.members.opacity,
    }
  }
  return { type: 'line', ...styles[part] }
}

/** Configured parts overlaid in drawing order; used by tooltips and the legend heading. */
export function ensembleSymbol(
  options: Readonly<EnsembleOptions>,
  tokens: ThemeTokens,
): SymbolSpec {
  const styles = resolveEnsembleStyles(options, tokens)
  const parts = drawOrder.filter((part) => options[part] !== false)
  return { type: 'composite', parts: parts.map((part) => partSymbol(part, styles)) }
}

const drawOrder: readonly EnsemblePart[] = ['spread', 'members', 'mean', 'median', 'control']

function partLabel(part: EnsemblePart, options: Readonly<EnsembleOptions>, store: EnsembleStore) {
  if (part === 'spread') {
    const bands = spreadBands(options)
    return bands.length === 1 ? `${bands[0][0]}–${bands[0][1]}%` : 'Spread'
  }
  if (part === 'control' && options.control)
    return store.members[controlMemberIndex(store, options.control.member)].label
  return part[0].toUpperCase() + part.slice(1)
}

function ensembleLegend(mark: EnsembleMark, tokens: ThemeTokens): MarkLegend {
  const options = mark.options.get().resolved
  const styles = resolveEnsembleStyles(options, tokens)
  const configured = ensembleParts.filter((part) => options[part] !== false)
  const resolved = () => mark.options.get().resolved
  const visibility = (visible: boolean, parts: readonly EnsemblePart[]) =>
    Object.fromEntries(parts.map((part) => [part, { visible }]))
  return {
    label: options.label,
    group: options.legendGroup,
    symbol: ensembleSymbol(options, tokens),
    visible: () => mark.visible,
    setVisible: (visible) => mark.update({ visible, ...visibility(visible, configured) }),
    layers: configured.map((part) => ({
      id: part,
      label: partLabel(part, options, mark.data),
      symbol: partSymbol(part, styles),
      visible: () => isPartVisible(resolved(), part),
      setVisible(visible) {
        // Showing one part of a hidden mark must not bring back its other parts.
        const others = mark.visible ? {} : visibility(false, configured)
        mark.update({ visible: true, ...others, [part]: { visible } })
      },
    })),
  }
}

type Project = (value: number) => number

/**
 * Linear and time scales are affine, so project through D3's bimap arithmetic once
 * per render instead of per vertex; other kinds fall back to the binding.
 */
function projector(binding: ScaleBinding): Project {
  const domain = binding.scale.domain.get()
  const d0 = Number(domain[0])
  const d1 = Number(domain[1])
  const kind = binding.scale.kind
  if ((kind !== 'linear' && kind !== 'time') || d0 === d1 || !Number.isFinite(d1 - d0)) {
    return (value) => binding.project(value)
  }
  const r0 = binding.project(d0)
  const r1 = binding.project(d1)
  if (d1 < d0) {
    return (value) => {
      const t = (value - d1) / (d0 - d1)
      return r1 * (1 - t) + r0 * t
    }
  }
  return (value) => {
    const t = (value - d0) / (d1 - d0)
    return r0 * (1 - t) + r1 * t
  }
}

/** Receives path commands; `Path2D` satisfies it directly. */
interface PathSink {
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
}

function svgPath() {
  let d = ''
  return {
    moveTo(x: number, y: number) {
      d += `M${x},${y}`
    },
    lineTo(x: number, y: number) {
      d += `L${x},${y}`
    },
    get d() {
      return d
    },
  }
}

function traceLine(
  sink: PathSink,
  length: number,
  xAt: (index: number) => number,
  yAt: (index: number) => number,
  px: Project,
  py: Project,
  indices?: Iterable<number>,
) {
  let drawing = false
  const add = (index: number) => {
    const value = yAt(index)
    if (!Number.isFinite(value)) {
      drawing = false
      return
    }
    if (drawing) sink.lineTo(px(xAt(index)), py(value))
    else sink.moveTo(px(xAt(index)), py(value))
    drawing = true
  }
  if (indices) for (const index of indices) add(index)
  else for (let index = 0; index < length; index += 1) add(index)
}

function linePath(
  length: number,
  xAt: (index: number) => number,
  yAt: (index: number) => number,
  px: Project,
  py: Project,
) {
  const path = svgPath()
  traceLine(path, length, xAt, yAt, px, py)
  return path.d
}

function bandPath(
  store: EnsembleStore,
  low: EnsembleStatistic,
  high: EnsembleStatistic,
  px: Project,
  py: Project,
) {
  let data = ''
  let runStart = 0
  const flush = (end: number) => {
    if (end > runStart) {
      for (let index = runStart; index < end; index += 1) {
        data += `${index === runStart ? 'M' : 'L'}${px(store.xAt(index))},${py(high.at(index))}`
      }
      for (let index = end - 1; index >= runStart; index -= 1) {
        data += `L${px(store.xAt(index))},${py(low.at(index))}`
      }
      data += 'Z'
    }
    runStart = end + 1
  }
  for (let index = 0; index < store.length; index += 1) {
    if (!Number.isFinite(low.at(index)) || !Number.isFinite(high.at(index))) flush(index)
  }
  flush(store.length)
  return data
}

function createEnsembleRenderer(): MarkRenderer<EnsembleMark> {
  const group = svgElement('g', { 'data-mark': 'ensemble' })
  const spreadGroup = svgElement('g', { 'data-part': 'spread' })
  const membersGroup = svgElement('g', { 'data-part': 'members' })
  const lines = {
    mean: svgElement('path', { 'data-part': 'mean', fill: 'none' }),
    median: svgElement('path', { 'data-part': 'median', fill: 'none' }),
    control: svgElement('path', { 'data-part': 'control', fill: 'none' }),
  }
  group.append(spreadGroup, membersGroup, lines.mean, lines.median, lines.control)
  const geometryKey = createKeyCache()
  const styleKey = createKeyCache()

  function renderMembers(
    mark: EnsembleMark,
    options: Readonly<EnsembleOptions>,
    xScale: ScaleBinding,
    yScale: ScaleBinding,
  ) {
    const store = mark.data
    const domain = xScale.scale.domain.get()
    const range = xScale.range.get()
    const width = Math.max(1, Math.floor(Math.abs(range[1] - range[0])))
    const window: Window = [Number(domain[0]), Number(domain[1])]
    const decimate = store.length > width * 4
    const canvas = options.renderer === 'canvas'
    if (!canvas) clearCompositeCanvas(membersGroup)
    const shapes: CanvasShape[] = []
    const count = drawnMemberCount(options, store)
    const px = projector(xScale)
    const py = projector(yScale)
    for (let member = 0; member < count; member += 1) {
      const sink = canvas ? new Path2D() : svgPath()
      traceLine(
        sink,
        store.length,
        store.xAt,
        (index) => store.valueAt(member, index),
        px,
        py,
        decimate ? store.memberLod(member, window, width) : undefined,
      )
      const id = store.members[member].id
      if (canvas) {
        shapes.push({ layerId: id, path: sink as Path2D })
        continue
      }
      let node = membersGroup.children[member] as SVGPathElement | undefined
      if (!node) {
        node = svgElement('path', { 'data-part': 'member', fill: 'none' })
        membersGroup.append(node)
      }
      node.dataset.memberId = id
      node.setAttribute('d', (sink as ReturnType<typeof svgPath>).d)
    }
    if (canvas) {
      if (count) renderCompositeCanvas(membersGroup, shapes)
      else clearCompositeCanvas(membersGroup)
    } else {
      while (membersGroup.children.length > count) membersGroup.lastElementChild?.remove()
    }
  }

  return {
    mount(layer, mark) {
      setMarkId(group, mark.id)
      layer.append(group)
    },
    geometry(mark: EnsembleMark, context: MarkRenderContext) {
      const options = visibleParts(mark.options.get().resolved)
      const xScale = context.scales[mark.x]
      const yScale = context.scales[mark.y]
      const key = [
        mark,
        mark.options.version,
        mark.data.version,
        ...(options.renderer === 'canvas' ? [window.devicePixelRatio] : []),
        ...scaleKey(xScale),
        ...scaleKey(yScale),
      ]
      if (!geometryKey.changed(key)) return
      styleKey.clear()
      group.setAttribute('display', options.visible ? '' : 'none')
      if (!options.visible) return
      const store = mark.data
      renderMembers(mark, options, xScale, yScale)
      const px = projector(xScale)
      const py = projector(yScale)
      const statistics = ensembleStatistics(options, store)
      const bands = statistics.bands
      for (const [position, [low, high, lowStatistic, highStatistic]] of bands.entries()) {
        let node = spreadGroup.children[position] as SVGPathElement | undefined
        if (!node) {
          node = svgElement('path', { 'data-part': 'band', stroke: 'none' })
          spreadGroup.append(node)
        }
        node.dataset.band = `${low}-${high}`
        node.setAttribute('d', bandPath(store, lowStatistic, highStatistic, px, py))
      }
      while (spreadGroup.children.length > bands.length) spreadGroup.lastElementChild?.remove()
      for (const part of ['mean', 'median'] as const) {
        const statistic = statistics[part]
        lines[part].setAttribute(
          'd',
          statistic ? linePath(store.length, store.xAt, statistic.at, px, py) : '',
        )
      }
      const control = options.control
        ? controlMemberIndex(store, options.control.member)
        : undefined
      lines.control.setAttribute(
        'd',
        control === undefined
          ? ''
          : linePath(store.length, store.xAt, (index) => store.valueAt(control, index), px, py),
      )
    },
    style(mark: EnsembleMark, tokens: ThemeTokens) {
      if (!styleKey.changed([mark, mark.options.version, tokens])) return
      const options = visibleParts(mark.options.get().resolved)
      const styles = resolveEnsembleStyles(options, tokens)
      const memberStyle: CompositeStyle = {
        fill: 'none',
        stroke: styles.members.stroke,
        strokeWidth: styles.members.strokeWidth,
        strokeOpacity: styles.members.opacity,
      }
      const canvasLayers = new Map(
        mark.data.members
          .slice(0, drawnMemberCount(options, mark.data))
          .map((member) => [member.id, memberStyle]),
      )
      if (!styleCompositeCanvas(membersGroup, canvasLayers, {}, tokens)) {
        for (const node of membersGroup.children) {
          node.setAttribute('stroke', styles.members.stroke)
          node.setAttribute('stroke-width', String(styles.members.strokeWidth))
          node.setAttribute('stroke-opacity', String(styles.members.opacity))
        }
      }
      for (const node of spreadGroup.children) {
        node.setAttribute('fill', styles.spread.fill)
        node.setAttribute('fill-opacity', String(styles.spread.opacity))
      }
      for (const part of ['mean', 'median', 'control'] as const) {
        const style = styles[part]
        lines[part].setAttribute('stroke', style.stroke)
        lines[part].setAttribute('stroke-width', String(style.strokeWidth))
        if (style.strokeDasharray)
          lines[part].setAttribute('stroke-dasharray', style.strokeDasharray)
        else lines[part].removeAttribute('stroke-dasharray')
      }
    },
    destroy() {
      clearCompositeCanvas(membersGroup)
      group.remove()
    },
  }
}

function ensembleHighlight(
  mark: EnsembleMark,
  hit: MarkHit,
  scales: Readonly<Record<string, ScaleBinding>>,
  color: string,
): readonly HighlightShape[] {
  if (!isEnsembleHit(hit) || !Number.isFinite(hit.px) || !Number.isFinite(hit.py)) return []
  const dot: HighlightShape = { type: 'circle', cx: hit.px, cy: hit.py, r: 3, fill: color }
  if (!hit.member) return [dot]
  const store = mark.data
  const member = hit.member.index
  const xScale = scales[mark.x]
  const domain = xScale.scale.domain.get()
  const range = xScale.range.get()
  const width = Math.max(1, Math.floor(Math.abs(range[1] - range[0])))
  const path = svgPath()
  traceLine(
    path,
    store.length,
    store.xAt,
    (index) => store.valueAt(member, index),
    projector(xScale),
    projector(scales[mark.y]),
    store.length > width * 4
      ? store.memberLod(member, [Number(domain[0]), Number(domain[1])], width)
      : undefined,
  )
  return [{ type: 'path', d: path.d, stroke: color }, dot]
}

function addExtent(add: (value: number) => void, extent: Window | undefined) {
  if (!extent) return
  add(extent[0])
  add(extent[1])
}

function memberExtent(store: EnsembleStore, member: number, window: Window | undefined) {
  const from = window ? Math.min(...window) : -Infinity
  const to = window ? Math.max(...window) : Infinity
  let low = Infinity
  let high = -Infinity
  for (let index = 0; index < store.length; index += 1) {
    const x = store.xAt(index)
    if (x < from || x > to) continue
    const value = store.valueAt(member, index)
    if (!Number.isFinite(value)) continue
    low = Math.min(low, value)
    high = Math.max(high, value)
  }
  return low <= high ? ([low, high] as const) : undefined
}

function validateScales(options: Readonly<EnsembleOptions>, context: MarkValidationContext) {
  if (context.coordinateSystem !== 'cartesian')
    throw new Error('ensemble() supports cartesian plots only.')
  const x = context.scales[options.x]
  const y = context.scales[options.y]
  if (!x || !y) throw new Error(`ensemble "${options.id ?? ''}" references a missing x or y scale.`)
  if (x.kind === 'band' || y.kind === 'band')
    throw new Error('ensemble() requires numeric/time scales.')
  if (context.direction(options.x) !== 'x' || context.direction(options.y) !== 'y')
    throw new Error('ensemble scales require x and y directions respectively.')
}

export const ensembleDefinition: MarkDefinition<EnsembleMark> = {
  name: 'ensemble',
  is: isEnsembleMark,
  hits: (mark, { scales, point, axis, plot }) => ensembleHits(mark, scales, point, axis, plot),
  highlight: (mark, hit, { scales, color }) => ensembleHighlight(mark, hit, scales, color),
  legend: ensembleLegend,
  validate: (mark, context) => validateScales(mark.options.get().resolved, context),
  extents(mark, context) {
    const options = visibleParts(mark.options.get().resolved)
    if (!options.visible) return
    const store = mark.data
    const _version = store.version
    if (mark.x === context.scale) {
      addExtent(context.add, store.extent('x'))
      return
    }
    if (mark.y !== context.scale) return
    const visible = extentWindow(context, mark.x)
    const window: Window | undefined = visible
      ? [Number(visible[0]), Number(visible[1])]
      : undefined
    const members = drawnMemberCount(options, store)
    if (members === store.memberCount) addExtent(context.add, store.extent('y', window))
    else {
      for (let member = 0; member < members; member += 1)
        addExtent(context.add, memberExtent(store, member, window))
    }
    const statistics = ensembleStatistics(options, store)
    for (const [, , low, high] of statistics.bands) {
      addExtent(context.add, low.extent(window))
      addExtent(context.add, high.extent(window))
    }
    addExtent(context.add, statistics.median?.extent(window))
    addExtent(context.add, statistics.mean?.extent(window))
    if (options.control) {
      const member = controlMemberIndex(store, options.control.member)
      addExtent(context.add, memberExtent(store, member, window))
    }
  },
  createRenderer: createEnsembleRenderer,
  track(mark) {
    mark.options.get()
    const _version = mark.data.version
  },
  validateUpdates: (mark, context) =>
    validateEnsembleUpdates(mark, (candidate) => validateScales(candidate, context())),
}
