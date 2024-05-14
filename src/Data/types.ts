export type DataValue = number | Date | number[]

export type DataPoint = {
  [key: string]: DataValue
}

export type DataPointArray = Array<{
  [key: string]: DataValue
}>

export type DataPointXY = Pick<DataPoint, 'x' | 'y'>
