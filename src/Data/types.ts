export type DataValue = number | Date | number[]

export type DataPoint = {
  [key: string]: DataValue | null
}

export type DataPointArray = Array<DataPoint>

export type DataPointXY = Pick<DataPoint, 'x' | 'y'>
