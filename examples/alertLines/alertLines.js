function onLoad() {
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

var container = document.getElementById('chart-container-1')
var axis = new wbCharts.CartesianAxes(container, null, null, {
  x: [{ type: 'time', showGrid: true }],
  y: [
    { label: 'Waterstand', unit: 'cm', showGrid: true, domain: [-450, 150] },
    { label: 'Wind richting', unit: 'deg', position: 'right', domain: [-150, 450] },
  ],
  margin: { left: 50, right: 50 },
})

// var refDate = new Date(2019,02,31);
var refDate = new Date()
var mouseOver = new wbCharts.MouseOver(['control', 'median'])
var zoom = new wbCharts.ZoomHandler()
var currentTime = new wbCharts.CurrentTime({ x: { axisIndex: 0 } })
var alertLine = new wbCharts.AlertLines({})

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

    const x1 = new Date()
    const x2 = new Date(x1.getTime() + 3 * 24 * 60 * 60 * 1000)

    alertLine.options = [
      {
        x1,
        x2,
        value: 100,
        yAxisIndex: 0,
        description: 'warning',
        color: '#00ffff',
      },
      {
        x1,
        x2,
        value: -100,
        yAxisIndex: 0,
        description: 'alert',
        color: '#FF0000',
      },
      {
        x1,
        x2,
        value: 170,
        yAxisIndex: 0,
        description: 'out of bounds',
        color: '#ffff00',
      },
    ]
    data.times.forEach(function (time, index) {
      var dateTime = new Date((time - medianTime) * 1000 + refDate.getTime())
      for (i = 0; i < nEnsemble; i++) {
        members[i].push({ x: dateTime, y: data.values[index][i] })
      }
      var points = data.values[index]
      percentiles[0].push({ x: dateTime, y: percentile(0.5, points) })
      percentiles[1].push({ x: dateTime, y: percentile([0.25, 0.75], points) })
      percentiles[2].push({ x: dateTime, y: percentile([0.05, 0.95], points) })
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
      { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
      'percent90',
      style90
    )
    plotPercentile50.addTo(
      axis,
      { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 1 } },
      'percent50',
      style50
    )

    plotControl1.addTo(
      axis,
      { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
      'control',
      '#control-line'
    )
    plotMedian1.addTo(
      axis,
      { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 1 } },
      'median',
      '#median-line'
    )
    axis.accept(currentTime)
    axis.accept(alertLine)
    axis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
    axis.zoom()
    axis.accept(zoom)
    axis.accept(mouseOver)
  })
}
window.setTimeout(dataload, 1000)
}

window.onload = onLoad
