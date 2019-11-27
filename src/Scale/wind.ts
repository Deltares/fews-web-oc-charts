import * as d3 from 'd3'

const scaleWindCategories = d3.scaleQuantize<string>()
.domain([-11.25, 371.25])
.range([
  "N", "NNW", 'NW', "WNW",
  'W', "WZW", 'ZW', "ZZW", 
  'Z', "ZZO", 'ZO', "OZO", 
  "O", "ONO", 'NO', 'NNO', 'N'
])

const beaufortLimits = [.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7]
const beaufortLabels = [0, 1, 2 ,3 ,4, 5, 6, 7, 8, 9, 10, 11, 12] 
const scaleBeaufort = d3.scaleThreshold() 
  .domain(beaufortLimits)
  .range(beaufortLabels)

export { scaleWindCategories, scaleBeaufort }