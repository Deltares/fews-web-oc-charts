
function onLoad() {
var container = document.getElementById('chart-container-1')
  axis = new wbCharts.CartesianAxes(container, null, null, {
  x: [
    {
      type: wbCharts.AxisType.time,
      label: 'datum',
      position: wbCharts.AxisPosition.AtZero,
      showGrid: false,
    },
  ],
  y: [
    {
      position: wbCharts.AxisPosition.Left,
      showGrid: true,
      nice: true,
      includeZero: true,
      label: 'Waterstand',
      unit: 'cm',
    },
  ],
  margin: {
    left: 100,
    right: 100,
  },
})

var legend = new wbCharts.Legend(
  [
    {
      selector: 'median',
      label: 'Middelste (P50)',
    },
    {
      selector: 'control',
      label: 'Controle',
    },
    {
      selector: 'percent90',
      label: '90% interval',
    },
    {
      selector: 'percent50',
      label: '50% interval',
    },
    {
      selector: 'ensemble',
      label: 'Verstoord',
    },
    {
      selector: 'missing',
      label: 'Missing',
    },
  ],
  document.getElementById('chart-legend-1')
)

var currentTime = new wbCharts.CurrentTime({
  x: {
    axisIndex: 0,
  },
})
var dstIndicator = new wbCharts.DstIndicator({
  x: {
    axisIndex: 0,
  },
})
var levelSelect = new wbCharts.LevelSelect(function (x) {
  console.log(x)
})
percentile = function (p, data) {
  var points = data
  points.sort(function (a, b) {
    return a - b
  })
  if (Array.isArray(p)) {
    var result = []
    for (i = 0; i < p.length; ++i) {
      var x = p[i] * (points.length + 1)
      var x1 = Math.floor(x)
      var frac = x - x1
      result.push(points[x1 - 1] + frac * (points[x1] - points[x1 - 1]))
    }
    return result
  } else {
    var x = p * (points.length + 1)
    var x1 = Math.floor(x)
    var frac = x - x1
    return points[x1 - 1] + frac * (points[x1] - points[x1 - 1])
  }
}

// var refDate = new Date(2019,02,31);
var refDate = new Date()
var refYear = refDate.getFullYear()
var mouseOver = new wbCharts.MouseOver(['control', 'median', 'percent90'])
var escalationLevels = [
  {
    id: 'laag',
    events: [
      { date: new Date(refYear, 0, 1), value: -90 },
      { date: new Date(refYear, 1, 1), value: -90 },
      { date: new Date(refYear, 2, 1), value: -90 },
      { date: new Date(refYear, 3, 1), value: -90 },
      { date: new Date(refYear, 4, 1), value: -100 },
      { date: new Date(refYear, 5, 1), value: -100 },
      { date: new Date(refYear, 6, 1), value: -100 },
      { date: new Date(refYear, 7, 1), value: -100 },
      { date: new Date(refYear, 8, 1), value: -100 },
      { date: new Date(refYear, 9, 1), value: -90 },
      { date: new Date(refYear, 10, 1), value: -90 },
      { date: new Date(refYear, 11, 1), value: -90 },
    ],
    color: 'rgba(205, 133, 63,.5)',
    c: '<',
  },
  {
    id: 'verhoogd',
    events: [
      { date: new Date(refYear, 0, 1), value: 110 },
      { date: new Date(refYear, 1, 1), value: 110 },
      { date: new Date(refYear, 2, 1), value: 110 },
      { date: new Date(refYear, 3, 1), value: 110 },
      { date: new Date(refYear, 4, 1), value: 100 },
      { date: new Date(refYear, 5, 1), value: 100 },
      { date: new Date(refYear, 6, 1), value: 100 },
      { date: new Date(refYear, 7, 1), value: 100 },
      { date: new Date(refYear, 8, 1), value: 100 },
      { date: new Date(refYear, 9, 1), value: 110 },
      { date: new Date(refYear, 10, 1), value: 110 },
      { date: new Date(refYear, 11, 1), value: 110 },
    ],
    color: 'rgba(255, 215, 0,.5)',
    c: '>',
  },
  {
    id: 'hoog',
    events: [
      { date: new Date(refYear, 0, 1), value: 120 },
      { date: new Date(refYear, 1, 1), value: 120 },
      { date: new Date(refYear, 2, 1), value: 120 },
      { date: new Date(refYear, 3, 1), value: 120 },
      { date: new Date(refYear, 4, 1), value: 110 },
      { date: new Date(refYear, 5, 1), value: 110 },
      { date: new Date(refYear, 6, 1), value: 110 },
      { date: new Date(refYear, 7, 1), value: 110 },
      { date: new Date(refYear, 8, 1), value: 110 },
      { date: new Date(refYear, 9, 1), value: 120 },
      { date: new Date(refYear, 10, 1), value: 120 },
      { date: new Date(refYear, 11, 1), value: 120 },
    ],
    color: 'rgba(255, 150, 0,.5)',
    c: '>',
  },
  {
    id: 'extreem',
    events: [
      { date: new Date(refYear, 0, 1), value: 160 },
      { date: new Date(refYear, 1, 1), value: 160 },
      { date: new Date(refYear, 2, 1), value: 160 },
      { date: new Date(refYear, 3, 1), value: 160 },
      { date: new Date(refYear, 4, 1), value: 140 },
      { date: new Date(refYear, 5, 1), value: 140 },
      { date: new Date(refYear, 6, 1), value: 140 },
      { date: new Date(refYear, 7, 1), value: 140 },
      { date: new Date(refYear, 8, 1), value: 140 },
      { date: new Date(refYear, 9, 1), value: 160 },
      { date: new Date(refYear, 10, 1), value: 160 },
      { date: new Date(refYear, 11, 1), value: 160 },
    ],
    color: 'rgba(255, 0, 0,.5)',
    c: '>',
  },
]

var escalationsVisitor = new wbCharts.WarningLevels(escalationLevels)
var zoom = new wbCharts.ZoomHandler()

axis.accept(legend)

function dataload() {
  d3.json('../data/ensemble.json').then(function (data) {
    var nEnsemble = data.values[0].length
    var members = Array(nEnsemble)
    var percentiles = [[], [], []]

    for (s = 0; s < nEnsemble; s++) {
      members[s] = []
    }
    var plotEnsemble = []
    var medianTime = (data.times[0] + data.times[data.times.length - 1]) / 2
    console.log(new Date(medianTime * 1000))

    data.times.forEach(function (time, index) {
      var dateTime = new Date((time - medianTime) * 1000 + refDate.getTime())
      for (i = 0; i < nEnsemble; i++) {
        members[i].push({
          x: dateTime,
          y: data.values[index][i],
        })
      }
      var points = data.values[index]
      percentiles[0].push({
        x: dateTime,
        y: percentile(0.5, points),
      })
      percentiles[1].push({
        x: dateTime,
        y: percentile([0.25, 0.75], points),
      })
      percentiles[2].push({
        x: dateTime,
        y: percentile([0.05, 0.95], points),
      })
    })

    var plotMedian = new wbCharts.ChartLine(percentiles[0], {})
    var plotControl = new wbCharts.ChartLine(members[0], {})

    var plotControl1 = new wbCharts.ChartLine(members[0], {})
    var plotMedian1 = new wbCharts.ChartMarker(percentiles[0], {})
    var plotPercentile50 = new wbCharts.ChartArea(percentiles[1], {})
    var plotPercentile90 = new wbCharts.ChartArea(percentiles[2], {})

    let style90 = {
      fill: 'skyblue',
      stroke: 'skyblue',
    }
    let style50 = {
      fill: 'deepskyblue',
      stroke: 'deepskyblue',
    }
    const styleLine = {
      fill: 'none',
      stroke: 'white',
    }
    plotPercentile90.addTo(
      axis,
      {
        x: {
          key: 'x',
          axisIndex: 0,
        },
        y: {
          key: 'y',
          axisIndex: 0,
        },
      },
      'percent90',
      style90
    )
    plotPercentile50.addTo(
      axis,
      {
        x: {
          key: 'x',
          axisIndex: 0,
        },
        y: {
          key: 'y',
          axisIndex: 0,
        },
      },
      'percent50',
      style50
    )

    for (i = 1; i < nEnsemble; i++) {
      var plotEnsemble = new wbCharts.ChartLine(members[i], {})
      let declaration = {
        stroke: 'green',
        'stroke-width': '1px',
        fill: 'none',
        opacity: '.5',
      }

      plotEnsemble.addTo(
        axis,
        {
          x: {
            key: 'x',
            axisIndex: 0,
          },
          y: {
            key: 'y',
            axisIndex: 0,
          },
        },
        'ensemble',
        declaration
      )
    }

    plotControl1.addTo(
      axis,
      {
        x: {
          key: 'x',
          axisIndex: 0,
        },
        y: {
          key: 'y',
          axisIndex: 0,
        },
      },
      'control',
      '#control-line'
    )
    plotMedian1.addTo(
      axis,
      {
        x: {
          key: 'x',
          axisIndex: 0,
        },
        y: {
          key: 'y',
          axisIndex: 0,
        },
      },
      'median',
      '#median-line'
    )
    axis.redraw({
      x: {
        autoScale: true,
      },
      y: {
        autoScale: true,
      },
    })
    axis.zoom()
    axis.accept(currentTime)
    axis.accept(dstIndicator)
    axis.accept(levelSelect)
    axis.accept(escalationsVisitor)
    axis.accept(zoom)
    axis.accept(mouseOver)
  })
}
window.setTimeout(dataload, 1000)
}

window.onload = onLoad

