/** The axes a drag has left its dead zone on. `dx` and `dy` are absolute distances. */
export function dragMode(dx: number, dy: number, threshold: number): 'x' | 'y' | 'xy' | undefined {
  if (dx <= threshold && dy <= threshold) return undefined
  if (dy <= threshold) return 'x'
  if (dx <= threshold) return 'y'
  return 'xy'
}

/** The CSS touch action that leaves the browser the directions a gesture doesn't use. */
export function touchActionFor(mode: string): 'pan-x' | 'pan-y' | 'none' {
  if (mode === 'x') return 'pan-y'
  if (mode === 'y') return 'pan-x'
  return 'none'
}
