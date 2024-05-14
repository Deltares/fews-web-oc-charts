import { min, max, extent } from 'd3'
import { DataPointArray } from './types'

/**
 * Calculates the data extent for a given path in the data array.
 * @param data - The data array.
 * @param path - The path to the desired data.
 * @returns The data extent as an array containing the minimum and maximum values.
 */
export function dataExtentFor(data: DataPointArray, path: string) {
  if (data.length === 0) return [undefined, undefined]
  if (Array.isArray(data[0][path])) {
    const minV = min(data, function (d) {
      if (d[path] === null) return undefined
      return min(d[path] as number[])
    })
    const maxV = max(data, function (d) {
      if (d[path] === null) return undefined
      return max(d[path] as number[])
    })
    return [minV, maxV]
  } else {
    return extent(data, (d) => d[path] as number | Date)
  }
}
