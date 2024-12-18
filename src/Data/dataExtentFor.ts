import { min, max, extent } from 'd3'
import type { DataPoint } from './types'

/**
 * Calculates the data extent for a given path in the data array.
 * @param data - The data array.
 * @param path - The path to the desired data.
 * @returns The data extent as an array containing the minimum and maximum values.
 */
export function dataExtentFor<T extends DataPoint>(data: Array<T>, path: string, filter?: (d: T) => boolean): [number | Date | undefined, number | Date | undefined] {
  const filteredData = filter ? data.filter(filter) : data
  if (filteredData.length === 0) return [undefined, undefined]
  if (Array.isArray(filteredData[0][path])) {
    const minV = min(filteredData, function (d) {
      if (d[path] === null) return undefined
      return min(d[path] as number[])
    })
    const maxV = max(filteredData, function (d) {
      if (d[path] === null) return undefined
      return max(d[path] as number[])
    })
    return [minV, maxV]
  } else {
    return extent(filteredData, (d) => d[path] as number | Date)
  }
}
