import type { Size } from '../layout/layout.js'

const consumers = new Map<Element, Set<(size: Size) => void>>()
let observer: ResizeObserver | undefined

export function observeSize(element: Element, changed: (size: Size) => void): () => void {
  observer ??= new ResizeObserver((entries) => {
    for (const entry of entries) {
      for (const consumer of consumers.get(entry.target) ?? []) {
        consumer({ width: entry.contentRect.width, height: entry.contentRect.height })
      }
    }
  })
  let callbacks = consumers.get(element)
  if (!callbacks) {
    callbacks = new Set()
    consumers.set(element, callbacks)
    observer.observe(element)
  }
  callbacks.add(changed)
  return () => {
    callbacks.delete(changed)
    if (callbacks.size === 0) {
      observer?.unobserve(element)
      consumers.delete(element)
    }
    if (consumers.size === 0) {
      observer?.disconnect()
      observer = undefined
    }
  }
}
