const consumers = new Map<Element, Set<(visible: boolean) => void>>()
const visibility = new Map<Element, boolean>()
let observer: IntersectionObserver | undefined

// Synchronous first guess so on-screen plots render immediately; the observer corrects it.
function estimateVisibility(element: Element): boolean {
  if (!element.isConnected) return false
  const rect = element.getBoundingClientRect()
  const view = element.ownerDocument.defaultView
  if (!view) return false
  return (
    rect.bottom >= 0 &&
    rect.right >= 0 &&
    rect.top <= view.innerHeight &&
    rect.left <= view.innerWidth
  )
}

export function observeVisibility(
  element: Element,
  changed: (visible: boolean) => void,
): () => void {
  observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!consumers.has(entry.target)) continue
      visibility.set(entry.target, entry.isIntersecting)
      for (const consumer of consumers.get(entry.target) ?? []) {
        consumer(entry.isIntersecting)
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
  changed(visibility.get(element) ?? estimateVisibility(element))
  return () => {
    if (!callbacks.delete(changed)) return
    if (callbacks.size === 0) {
      observer?.unobserve(element)
      consumers.delete(element)
      visibility.delete(element)
    }
    if (consumers.size === 0) {
      observer?.disconnect()
      observer = undefined
    }
  }
}
