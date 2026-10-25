import { reactive } from '../core/runtime.js'
import type { ReadonlySignal, Signal } from '../core/reactive.js'
import { validateKeys } from '../core/validation.js'
import type { ScaleBinding, ScaleHandle, ScaleValue } from '../scales/scale.js'
import type { Region } from '../layout/layout.js'

export interface SharedPointerOptions {
  by?: 'x' | 'y' | 'xy'
}

export interface SharedPointerValue {
  readonly scale: ScaleHandle
  readonly value: ScaleValue
}

export interface SharedPointerState {
  readonly source: symbol | undefined
  readonly active: boolean
  readonly values: readonly SharedPointerValue[]
}

export interface SharedPointer {
  readonly by: 'x' | 'y' | 'xy'
  readonly state: ReadonlySignal<SharedPointerState>
}

const inactive: SharedPointerState = Object.freeze({
  source: undefined,
  active: false,
  values: Object.freeze([]),
})
const states = new WeakMap<object, Signal<SharedPointerState>>()

export function isSharedPointer(value: object): value is SharedPointer {
  return states.has(value)
}

/** Share domain coordinates, never a plot's pixels or inside flag. */
export function sharedPointer(options: SharedPointerOptions = {}): SharedPointer {
  validateKeys(options, ['by'], 'sharedPointer')
  const by = options.by === undefined ? 'x' : options.by
  if (!['x', 'y', 'xy'].includes(by)) {
    throw new Error('sharedPointer.by must be x, y or xy.')
  }
  const state = reactive.signal<SharedPointerState>(inactive)
  const handle: SharedPointer = Object.freeze({
    by,
    state: reactive.register({
      get: () => state.get(),
      get version() {
        return state.version
      },
    }),
  })
  states.set(handle, state)
  return handle
}

export function publishSharedPointer(
  pointer: SharedPointer,
  source: symbol,
  values: readonly SharedPointerValue[],
) {
  const state = states.get(pointer)!
  const previous = reactive.untracked(() => state.get())
  if (!values.length) {
    releaseSharedPointer(pointer, source)
    return
  }
  if (
    previous.source === source &&
    previous.values.length === values.length &&
    previous.values.every(
      (entry, index) => entry.scale === values[index].scale && entry.value === values[index].value,
    )
  ) {
    return
  }
  state.set(
    Object.freeze({
      source,
      active: true,
      values: Object.freeze(values.map((entry) => Object.freeze({ ...entry }))),
    }),
  )
}

export function releaseSharedPointer(pointer: SharedPointer, source: symbol) {
  const state = states.get(pointer)!
  if (reactive.untracked(() => state.get().source) === source) state.set(inactive)
}

export function projectSharedPointer(
  pointer: SharedPointer,
  mode: 'x' | 'y' | 'xy',
  preferred: { readonly x?: string; readonly y?: string },
  scales: Readonly<Record<string, ScaleBinding>>,
  direction: (name: string) => string,
  region: Readonly<Region>,
) {
  const shared = pointer.state.get()
  const point = { x: region.x + region.width / 2, y: region.y + region.height / 2 }
  let axes = ''
  for (const axis of ['x', 'y'] as const) {
    if (!mode.includes(axis) || !pointer.by.includes(axis)) continue
    const matches = Object.entries(scales).filter(
      ([name, binding]) =>
        direction(name) === axis && shared.values.some((entry) => entry.scale === binding.scale),
    )
    const match = matches.find(([name]) => name === preferred[axis]) ?? matches[0]
    if (!match) continue
    const [, binding] = match
    const value = shared.values.find((entry) => entry.scale === binding.scale)!.value
    const domain = binding.scale.domain.get()
    if (binding.scale.kind === 'band') {
      if (!domain.includes(value)) continue
    } else if (Number(value) < Number(domain[0]) || Number(value) > Number(domain[1])) {
      continue
    }
    const pixel = binding.project(value)
    const low = axis === 'x' ? region.x : region.y
    const high = low + (axis === 'x' ? region.width : region.height)
    if (!Number.isFinite(pixel) || pixel < low || pixel > high) continue
    point[axis] = pixel
    axes += axis
  }
  return {
    point,
    axes,
    inside: shared.active && axes.length > 0 && region.width > 0 && region.height > 0,
  }
}
