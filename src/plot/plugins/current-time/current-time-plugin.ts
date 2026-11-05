import type { OptionPatch } from '../../../core/options.js'
import { reactive } from '../../../core/runtime.js'
import type { ScaleKind } from '../../../scales/scale.js'
import { sharedClock } from '../../../sync/shared-clock.js'
import { displayInspectionValue } from '../../interaction/inspection.js'
import { svgElement } from '../../rendering/svg.js'
import type { PluginDefinition, PlotContext } from '../plugin-definition.js'
import { registerPlugin } from '../plugins.js'
import {
  currentTime as createCurrentTimeHandle,
  isCurrentTimeHandle,
  validateCurrentTimeUpdates,
  type CurrentTimeHandle,
  type CurrentTimeOptions,
} from './current-time.js'

const REFRESH_INTERVAL = 10_000

interface ScaleContext {
  readonly names: readonly string[]
  scaleKind(name: string): ScaleKind | undefined
  direction(this: void, name: string): string
}

/** The explicitly named scale, or the only x-direction time scale. */
function resolveScale(options: Readonly<CurrentTimeOptions>, context: ScaleContext): string {
  const candidates =
    options.x === undefined
      ? context.names.filter(
          (name) => context.scaleKind(name) === 'time' && context.direction(name) === 'x',
        )
      : [options.x]
  const [name] = candidates
  if (
    candidates.length !== 1 ||
    context.scaleKind(name) !== 'time' ||
    context.direction(name) !== 'x'
  ) {
    throw new Error(
      options.x === undefined
        ? 'currentTime.x must name a time scale, because the plot needs exactly one to infer it.'
        : `currentTime.x must name a time scale in the x direction, not "${options.x}".`,
    )
  }
  return name
}

function liveScaleContext(context: PlotContext): ScaleContext {
  return {
    names: Object.keys(context.scales),
    scaleKind: (name) => context.scales[name]?.scale.kind,
    direction: context.direction,
  }
}

function installCurrentTime(handle: CurrentTimeHandle, context: PlotContext) {
  const guide = svgElement('g', { 'data-layer': 'current-time', 'aria-hidden': 'true' })
  const line = svgElement('line', {
    'data-current-time-line': '',
    'vector-effect': 'non-scaling-stroke',
    'pointer-events': 'none',
  })
  const indicator = svgElement('polygon', {
    'data-current-time-indicator': '',
    points: '0,0 5,5 -5,5',
  })
  const label = svgElement('g', { 'data-current-time-label': '', 'pointer-events': 'none' })
  const labelBackground = svgElement('rect', { rx: 3 })
  const labelText = svgElement('text', { x: 6, 'dominant-baseline': 'central' })
  label.append(labelBackground, labelText)
  guide.append(line, indicator, label)
  context.element.append(guide)

  const hovered = reactive.signal(false)
  const onEnter = () => hovered.set(true)
  const onLeave = () => hovered.set(false)
  indicator.addEventListener('pointerenter', onEnter)
  indicator.addEventListener('pointerleave', onLeave)

  const ownClock = sharedClock({ interval: REFRESH_INTERVAL })

  function render() {
    if (context.suspended.get()) return
    const options = handle.options.get().resolved
    const value = (options.clock ?? ownClock).time.get()
    const name = resolveScale(options, liveScaleContext(context))
    const binding = context.scales[name]
    const domain = binding.scale.domain.get()
    if (value < Number(domain[0]) || value > Number(domain[1])) {
      guide.setAttribute('display', 'none')
      return
    }
    guide.removeAttribute('display')

    const plot = context.regions.get().plot
    const theme = context.theme.get()
    const size = context.size.get()
    const x = binding.project(value)
    const bottom = plot.y + plot.height
    line.setAttribute('x1', String(x))
    line.setAttribute('x2', String(x))
    line.setAttribute('y1', String(plot.y))
    line.setAttribute('y2', String(bottom))
    line.setAttribute('stroke', theme.accent)
    indicator.setAttribute('fill', theme.accent)
    indicator.setAttribute('transform', `translate(${x} ${bottom})`)

    if (options.label === 'hover') indicator.removeAttribute('display')
    else indicator.setAttribute('display', 'none')
    // Only the hover mode needs the indicator as a pointer target.
    indicator.setAttribute('pointer-events', options.label === 'hover' ? 'all' : 'none')

    const showLabel = options.label === 'always' || (options.label === 'hover' && hovered.get())
    if (!showLabel) {
      label.setAttribute('display', 'none')
      return
    }
    label.removeAttribute('display')
    labelText.textContent = options.format?.(value) ?? displayInspectionValue(value, context, name)
    const height = theme.fontSize + 10
    labelBackground.setAttribute('fill', theme.tooltipBackground)
    labelText.setAttribute('fill', theme.tooltipColor)
    labelText.setAttribute('font-family', theme.fontFamily)
    labelText.setAttribute('font-size', String(theme.fontSize))
    labelText.setAttribute('y', String(height / 2))
    const width = labelText.getComputedTextLength() + 12
    labelBackground.setAttribute('width', String(width))
    labelBackground.setAttribute('height', String(height))
    const labelX = Math.max(0, Math.min(size.width - width, x + 6))
    const labelY = Math.max(0, bottom - height - 6)
    label.setAttribute('transform', `translate(${labelX} ${labelY})`)
  }

  const stopValidation = validateCurrentTimeUpdates(handle, (options) => {
    resolveScale(options, liveScaleContext(context))
  })
  context.scope.run(() => {
    reactive.effect(() => {
      const paused = handle.options.get().resolved.clock !== undefined || context.suspended.get()
      if (paused) {
        ownClock.stop()
      } else {
        ownClock.tick()
        ownClock.start()
      }
    })
    reactive.effect(render)
  })
  return {
    destroy() {
      stopValidation()
      ownClock.destroy()
      indicator.removeEventListener('pointerenter', onEnter)
      indicator.removeEventListener('pointerleave', onLeave)
      guide.remove()
    },
  }
}

export const currentTimeDefinition: PluginDefinition<CurrentTimeHandle> = {
  name: 'currentTime',
  is: isCurrentTimeHandle,
  validate(handle, context) {
    if (context.coordinateSystem !== 'cartesian') {
      throw new Error('The currentTime plugin supports Cartesian plots only.')
    }
    resolveScale(handle.options.get().resolved, {
      names: Object.keys(context.scales),
      scaleKind: (name) => context.scales[name]?.kind,
      direction: context.direction,
    })
  },
  install: installCurrentTime,
}

export function currentTime(initial: OptionPatch<CurrentTimeOptions> = {}): CurrentTimeHandle {
  return registerPlugin(createCurrentTimeHandle(initial), currentTimeDefinition)
}
