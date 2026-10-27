import type { Region } from '../../layout/layout.js'
import type { ScaleBinding, ScaleHandle, ScaleValue } from '../../scales/scale.js'
import type { AxisHandle, AxisSide } from '../axes/axis.js'
import type { CoordinateSystem, Orientation } from '../marks/mark-definition.js'
import { invertSkewTPoint, type SoundingPoint } from './skew-t-geometry.js'

interface CoordinateOptions {
  readonly axes: readonly AxisHandle[]
  readonly directions: Readonly<Record<string, 'x' | 'y'>>
  readonly scales: Readonly<Record<string, ScaleHandle>>
}

interface PointerCoordinates {
  readonly svgX: number
  readonly svgY: number
  readonly plotX: number
  readonly plotY: number
  readonly region: Readonly<Region>
  readonly scales: Readonly<Record<string, ScaleBinding>>
  readonly skew?: number
  direction(this: void, name: string): Orientation
}

export interface CoordinateAdapter {
  direction(
    options: CoordinateOptions,
    name: string,
    candidate?: AxisHandle,
    position?: AxisSide,
  ): Orientation
  validateScales(options: CoordinateOptions): void
  invertPointer(coordinates: PointerCoordinates): Map<string, ScaleValue>
}

function axisPosition(axis: AxisHandle, candidate?: AxisHandle, position?: AxisSide) {
  return axis === candidate ? position : axis.options.get().resolved.position
}

function cartesianDirection(
  options: CoordinateOptions,
  name: string,
  candidate?: AxisHandle,
  position?: AxisSide,
): Orientation {
  const axes = options.axes.filter((axis) => axis.scale === name)
  const scale = options.scales[name]
  if (scale.kind === 'angular' || scale.kind === 'radial') {
    throw new Error(`Cartesian plots cannot use ${scale.kind} scale "${name}".`)
  }
  const axisDirections = axes.map((axis) => {
    const side = axisPosition(axis, candidate, position)
    if (side === 'angular' || side === 'radial') {
      throw new Error('Cartesian plots require top, right, bottom or left axes.')
    }
    return side === 'top' || side === 'bottom' ? 'x' : 'y'
  })
  const result =
    options.directions[name] ??
    axisDirections[0] ??
    (scale.kind === 'time' || scale.kind === 'band' ? 'x' : 'y')
  if (axisDirections.some((axisDirection) => axisDirection !== result)) {
    throw new Error(`plot.scales.${name} cannot bind to both x and y directions in one plot.`)
  }
  return result
}

function skewTDirection(
  options: CoordinateOptions,
  name: string,
  candidate?: AxisHandle,
  position?: AxisSide,
): Orientation {
  const axes = options.axes.filter((axis) => axis.scale === name)
  const scale = options.scales[name]
  const orientation = scale.kind === 'linear' ? 'x' : scale.kind === 'log' ? 'y' : undefined
  if (!orientation)
    throw new Error('Skew-T plots require linear temperature and log pressure scales.')
  if (
    axes.some((axis) => {
      const side = axisPosition(axis, candidate, position)
      return orientation === 'x' ? side !== 'bottom' : side !== 'left' && side !== 'right'
    })
  ) {
    throw new Error('Skew-T axes require bottom temperature and left or right pressure axes.')
  }
  return orientation
}

function polarDirection(
  options: CoordinateOptions,
  name: string,
  candidate?: AxisHandle,
  position?: AxisSide,
): Orientation {
  const axes = options.axes.filter((axis) => axis.scale === name)
  const scale = options.scales[name]
  const orientation =
    scale.kind === 'angular' ? 'angular' : scale.kind === 'radial' ? 'radial' : undefined
  if (!orientation) throw new Error(`Polar plots require angular or radial scales ("${name}").`)
  if (axes.some((axis) => axisPosition(axis, candidate, position) !== orientation)) {
    throw new Error(`Polar scale "${name}" requires an axis in the ${orientation} direction.`)
  }
  return orientation
}

function cartesianPointerValues(coordinates: PointerCoordinates) {
  const values = new Map<string, ScaleValue>()
  for (const [name, binding] of Object.entries(coordinates.scales)) {
    const pixel = coordinates.direction(name) === 'x' ? coordinates.svgX : coordinates.svgY
    if (binding.scale.kind === 'band') {
      const domain = binding.scale.domain.get()
      if (domain.length === 0) continue
      const centerAt = (index: number) => binding.project(domain[index]) + binding.bandwidth / 2
      let low = 0
      let high = domain.length - 1
      const ascending = centerAt(high) >= centerAt(low)
      while (low < high) {
        const middle = Math.floor((low + high) / 2)
        const midpoint = (centerAt(middle) + centerAt(middle + 1)) / 2
        if (ascending ? pixel > midpoint : pixel < midpoint) low = middle + 1
        else high = middle
      }
      values.set(name, domain[low])
    } else {
      values.set(name, binding.invert(pixel))
    }
  }
  return values
}

function skewTBindings(scales: Readonly<Record<string, ScaleBinding>>) {
  const entries = Object.entries(scales)
  const temperature = entries.find(([, binding]) => binding.scale.kind === 'linear')
  const pressure = entries.find(([, binding]) => binding.scale.kind === 'log')
  if (!temperature || !pressure) throw new Error('Skew-T temperature or pressure scale is missing.')
  return [temperature, pressure] as const
}

function skewTPointerValues(coordinates: PointerCoordinates) {
  const [temperature, pressure] = skewTBindings(coordinates.scales)
  if (coordinates.skew === undefined) throw new Error('Skew-T pointer inversion requires skew.')
  const sounding: SoundingPoint = invertSkewTPoint(
    temperature[1],
    pressure[1],
    coordinates.svgX,
    coordinates.svgY,
    coordinates.skew,
  )
  const values = new Map<string, ScaleValue>()
  values.set(temperature[0], sounding.temperature)
  values.set(pressure[0], sounding.pressure)
  return values
}

function polarPointerValues(coordinates: PointerCoordinates) {
  const entries = Object.entries(coordinates.scales)
  const angular = entries.find(([, binding]) => binding.scale.kind === 'angular')
  const radial = entries.find(([, binding]) => binding.scale.kind === 'radial')
  if (!angular || !radial) throw new Error('Polar plots require one angular and one radial scale.')
  const [angularName, angularBinding] = angular
  const [radialName, radialBinding] = radial
  const dx = coordinates.plotX - coordinates.region.width / 2
  const dy = coordinates.plotY - coordinates.region.height / 2
  const radius = Math.hypot(dx, dy)
  const angularOptions = angularBinding.scale.options.get().resolved
  const sign = angularOptions.direction === 'anticlockwise' ? -1 : 1
  const intercept = angularOptions.intercept ?? 0
  const angularRange = angularBinding.range.get()
  const middle = (angularRange[0] + angularRange[1]) / 2
  const angle = radius === 0 ? middle : sign * (Math.atan2(dx, -dy) - intercept)
  const unwrappedAngle = angle + Math.round((middle - angle) / (2 * Math.PI)) * 2 * Math.PI
  const values = new Map<string, ScaleValue>()
  values.set(angularName, angularBinding.invert(unwrappedAngle))
  values.set(radialName, radialBinding.invert(radius))
  return values
}

const coordinateAdapters: Readonly<Record<CoordinateSystem, CoordinateAdapter>> = {
  cartesian: {
    direction: cartesianDirection,
    validateScales: () => undefined,
    invertPointer: cartesianPointerValues,
  },
  skewT: {
    direction: skewTDirection,
    validateScales(options) {
      const scales = Object.values(options.scales)
      if (
        scales.length !== 2 ||
        scales.filter((scale) => scale.kind === 'linear').length !== 1 ||
        scales.filter((scale) => scale.kind === 'log').length !== 1
      ) {
        throw new Error(
          'Skew-T plots require exactly one linear temperature scale and one log pressure scale.',
        )
      }
      if (Object.keys(options.directions).length > 0) {
        throw new Error('Skew-T plots infer scale directions.')
      }
    },
    invertPointer: skewTPointerValues,
  },
  polar: {
    direction: polarDirection,
    validateScales(options) {
      const scales = Object.values(options.scales)
      if (
        scales.filter((scale) => scale.kind === 'angular').length !== 1 ||
        scales.filter((scale) => scale.kind === 'radial').length !== 1
      ) {
        throw new Error('Polar plots require exactly one angular scale and one radial scale.')
      }
      if (Object.keys(options.directions).length > 0) {
        throw new Error('Polar plots do not support cartesian plot.directions.')
      }
    },
    invertPointer: polarPointerValues,
  },
}

export function coordinateAdapter(system: CoordinateSystem): CoordinateAdapter {
  return coordinateAdapters[system]
}
