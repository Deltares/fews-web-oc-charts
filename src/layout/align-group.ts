import { reactive } from '../core/runtime.js'
import type { ReadonlySignal } from '../core/reactive.js'
import { finiteNonnegative } from '../core/validation.js'

export interface AlignmentBounds {
  readonly left: number
  /** Right plot boundary in local SVG coordinates, not a margin width. */
  readonly right: number
}

export interface AlignGroup {
  readonly bounds: ReadonlySignal<AlignmentBounds | undefined>
}

interface NaturalBounds {
  readonly width: number
  readonly left: number
  readonly right: number
}

interface AlignmentMember {
  report(width: number, left: number, right: number): void
  dispose(): void
}

const groups = new WeakMap<object, () => AlignmentMember>()

export function isAlignGroup(value: object): value is AlignGroup {
  return groups.has(value)
}

export function connectAlignGroup(group: AlignGroup): AlignmentMember {
  const connect = groups.get(group)
  if (!connect) throw new TypeError('Expected an alignGroup() handle.')
  return connect()
}

/** Aligns horizontal plot boundaries for vertically stacked Cartesian plots. */
export function alignGroup(): AlignGroup {
  const members = new Map<symbol, NaturalBounds>()
  const bounds = reactive.signal<AlignmentBounds | undefined>(
    undefined,
    (a, b) => a === b || (!!a && !!b && a.left === b.left && a.right === b.right),
  )
  function publish() {
    if (!members.size) {
      bounds.set(undefined)
      return
    }
    let left = 0
    let right = Infinity
    for (const member of members.values()) {
      left = Math.max(left, Math.min(member.left, member.width))
      right = Math.min(right, Math.max(0, member.width - member.right))
    }
    bounds.set(Object.freeze({ left, right: Math.max(left, right) }))
  }
  const group: AlignGroup = Object.freeze({
    bounds: reactive.register({
      get: () => bounds.get(),
      get version() {
        return bounds.version
      },
    }),
  })
  groups.set(group, () => {
    const id = Symbol('alignment member')
    let disposed = false
    return {
      report(width, left, right) {
        if (disposed) throw new Error('Cannot report a disposed alignment member.')
        finiteNonnegative(width, 'alignment.width')
        finiteNonnegative(left, 'alignment.left')
        finiteNonnegative(right, 'alignment.right')
        members.set(id, { width, left, right })
        publish()
      },
      dispose() {
        if (disposed) return
        disposed = true
        if (members.delete(id)) publish()
      },
    }
  })
  return group
}
