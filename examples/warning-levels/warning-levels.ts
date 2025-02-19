import '@lib/scss/wb-charts.scss'
import '@shared/shared.css'
import './warning-levels.css'

import '@shared/theme-button'

import { AxisType, CartesianAxes, ChartLine, WarningLevels } from '@lib'
import { type ExampleEvent, generateExampleTimeSeriesData } from '@shared'

function createLineChart(containerId: string, exampleData: ExampleEvent<Date>[]): CartesianAxes {
  // Create new axes.
  const container = document.getElementById(containerId)
  const axes = new CartesianAxes(container, null, null, {
    x: [{ type: AxisType.time }],
    y: [{ type: AxisType.value, domain: [-3, 5] }],
    margin: {
      right: 100,
    },
  })

  // Create line.
  const line = new ChartLine(exampleData, {})
  line.addTo(axes, { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } }, 'example', {
    fill: 'none',
    stroke: 'skyblue',
    'stroke-width': '2',
  })
  axes.redraw({ x: { autoScale: true }, y: { autoScale: true } })
  return axes
}

// Generate simple scalar example data.
const startTime = new Date('2025-01-01T12:00Z')
const endTime = new Date('2025-01-05T12:00Z')
const exampleData = generateExampleTimeSeriesData([startTime, endTime], [-2, 4], 100)

// The `escalationLevels` parameter of `WarningLevels` does not have a type. See
// issue #139.
const escalationLevelsUpper = [
  // Basic example.
  {
    // The "id" member is both the ID of the warning level and the display name
    // in the chart.
    // Note: the ticks for the warning levels are always shown on the right
    // axis, even if you specify that the warning levels should be plotted for
    // the left axis!
    id: 'lower warning',
    // The "color" member indicates what color the warning level will be plotted
    // in the chart; any CSS color is valid.
    color: 'orange',
    // The "c" member (which is "<" or ">") indicates whether the level is a
    // lower or upper threshold.
    c: '>',
    // The "events" member indicates points in time where the warning level may
    // change its value; this is what is plotted in the chart.
    events: [
      {
        date: new Date('2025-01-01T12:00Z'),
        value: 2,
      },
      // Warning levels transitions are drawn vertically at the point where they
      // change.
      {
        date: new Date('2025-01-02T12:00Z'),
        value: 3,
      },
      {
        date: new Date('2025-01-05T12:00Z'),
        value: 3,
      },
    ],
  },
  // Multiple warning levels should be specified in increasing order; different
  // conditions cannot be mixed in a single WarningLevel object. See issue #128.
  {
    id: 'higher warning',
    color: 'red',
    c: '>',
    // All escalation levels in a single WarningLevels object should have the
    // same number of events at the same dates. See issue #128.
    events: [
      {
        date: new Date('2025-01-01T12:00Z'),
        value: 4,
      },
      {
        date: new Date('2025-01-03T12:00Z'),
        value: 4.5,
      },
      {
        date: new Date('2025-01-05T12:00Z'),
        value: 4.5,
      },
    ],
  },
  // Warnings outside the range of the axis they are specified on are not drawn.
  {
    id: 'highest warning',
    color: 'red',
    c: '>',
    // All escalation levels in a single WarningLevels object should have the
    // same number of events at the same dates. See issue #128.
    events: [
      {
        date: new Date('2025-01-01T12:00Z'),
        value: 6,
      },
      {
        date: new Date('2025-01-03T12:00Z'),
        value: 6,
      },
      {
        date: new Date('2025-01-05T12:00Z'),
        value: 6,
      },
    ],
  },
]

const axesUpper = createLineChart('chart-container-upper', exampleData)
const warningLevels = new WarningLevels(escalationLevelsUpper, {})
axesUpper.accept(warningLevels)

// Escalation levels can also be set for part of the x-axis, and for a lower
// threshold rather than an upper threshold.
// Note: for a lower threshold, escalation levels should be specified in
//       decreasing order, or they will be plotted incorrectly. See issue #128.
const escalationLevelsLower = [
  {
    id: 'even lower bound',
    color: 'red',
    c: '<',
    events: [
      {
        date: new Date('2025-01-02T12:00Z'),
        value: -1.5,
      },
      {
        date: new Date('2025-01-03T12:00Z'),
        value: -2,
      },
      {
        date: new Date('2025-01-04T12:00Z'),
        value: -3,
      },
    ],
  },
  {
    id: 'lower bound',
    color: 'orange',
    c: '<',
    events: [
      {
        date: new Date('2025-01-02T12:00Z'),
        value: 0,
      },
      {
        date: new Date('2025-01-03T12:00Z'),
        value: -1,
      },
      {
        date: new Date('2025-01-04T12:00Z'),
        value: -1,
      },
    ],
  },
]

// We create a new axes to show the lower threshold warning levels, as more than
// one `WarningLevels` object per axes is currently not supported. See issue
// #140.
const axesLower = createLineChart('chart-container-lower', exampleData)
const warningLevelsLower = new WarningLevels(escalationLevelsLower, {})
axesLower.accept(warningLevelsLower)
