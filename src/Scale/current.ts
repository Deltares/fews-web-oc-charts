import * as d3 from 'd3'

const scaleCurrentCategories = d3
  .scaleQuantize<string>()
  .domain([-11.25, 371.25])
  .range([
    'N',
    'NNO',
    'NO',
    'ONO',
    'O',
    'OZO',
    'ZO',
    'ZZO',
    'Z',
    'ZZW',
    'ZW',
    'WZW',
    'W',
    'WNW',
    'NW',
    'NNW',
    'N',
  ])

export { scaleCurrentCategories }
