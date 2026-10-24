import type { ScaleKind } from '../../scales/scale.js'

const maxTime = 8.64e15

export function isValidScaleDomain(kind: ScaleKind, domain: readonly number[]): boolean {
  return domain.every(
    (value) =>
      Number.isFinite(value) &&
      (kind !== 'log' || value > 0) &&
      (kind !== 'time' || Math.abs(value) <= maxTime),
  )
}
