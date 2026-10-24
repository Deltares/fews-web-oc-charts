import type { Region } from '../../layout/layout.js'
import type { ScaleBinding, ScaleValue } from '../../scales/scale.js'

export function projectPolarPoint(
  angular: ScaleBinding,
  radial: ScaleBinding,
  region: Readonly<Region>,
  angleValue: ScaleValue,
  radiusValue: ScaleValue,
): { readonly x: number; readonly y: number } {
  const options = angular.scale.options.get().resolved
  const angleDirection = options.direction === 'anticlockwise' ? -1 : 1
  const angle = (options.intercept ?? 0) + angleDirection * angular.project(angleValue)
  const radius = radial.project(radiusValue)
  return Object.freeze({
    x: region.x + region.width / 2 + radius * Math.sin(angle),
    y: region.y + region.height / 2 - radius * Math.cos(angle),
  })
}
