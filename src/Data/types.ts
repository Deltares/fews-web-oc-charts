export type DataValue = number | Date | string | number[] | Date[]

export type DataPoint = {
  [key: string]: DataValue | null
}

export type DataPointArray = Array<DataPoint>

export type DataPointXY = Pick<DataPoint, 'x' | 'y'>
