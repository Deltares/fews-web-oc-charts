function onLoad() {
  // set constants
  var height = null
  var width = null
  var container1 = document.getElementById('chart-container-1')

  var axis1 = new wbCharts.CartesianAxes(container1, width, height, {
    x: [
      {
        type: wbCharts.AxisType.time,
        label: 'datum',
        position: wbCharts.AxisPosition.AtZero,
        showGrid: false,
      },
    ],
  })
  var container2 = document.getElementById('chart-container-2')
  var axis = new wbCharts.CartesianAxes(container2, width, height, {
    x: [
      {
        type: wbCharts.AxisType.time,
        label: 'datum',
        position: wbCharts.AxisPosition.AtZero,
        showGrid: false,
      },
    ],
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

  var refDate = new Date(2018, 10, 1)

  d3.json('../data/ensemble.json').then(function (data) {
    var nEnsemble = data.values[0].length
    var members = Array(nEnsemble)
    var percentiles = [[], [], []]

    for (s = 0; s < nEnsemble; s++) {
      members[s] = []
    }
    var plotEnsemble = []
    data.times.forEach(function (time, index) {
      var dateTime = new Date(time * 1000)
      if (dateTime.getTime() > refDate.getTime()) return

      for (i = 0; i < nEnsemble; i++) {
        members[i].push({ x: dateTime, y: data.values[index][i] })
      }
      var points = data.values[index]
      percentiles[0].push({ x: dateTime, y: percentile(0.5, points) })
      percentiles[1].push({ x: dateTime, y: percentile([0.25, 0.75], points) })
      percentiles[2].push({ x: dateTime, y: percentile([0.05, 0.95], points) })
    })

    for (i = 1; i < nEnsemble; i++) {
      var plotEnsemble = new wbCharts.ChartLine(members[i], {})
      plotEnsemble.addTo(
        axis1,
        { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
        'ensemble-line',
        '.nsemble-line'
      )
    }
    var plotMedian = new wbCharts.ChartLine(percentiles[0], {})
    var plotControl = new wbCharts.ChartLine(members[0], {})
    plotControl.addTo(
      axis1,
      { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
      'control',
      '#control-line'
    )
    plotMedian.addTo(
      axis1,
      { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
      'median',
      '#median-line'
    )
    axis1.redraw({ x: { autoScale: true }, y: { autoScale: true } })

    var plotControl1 = new wbCharts.ChartLine(members[0], {})
    var plotMedian1 = new wbCharts.ChartLine(percentiles[0], {})
    var plotPercentile50 = new wbCharts.ChartArea(percentiles[1], {})
    var plotPercentile90 = new wbCharts.ChartArea(percentiles[2], {})

    plotPercentile90.addTo(
      axis,
      { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
      'percent90',
      '#percent90'
    )
    plotPercentile50.addTo(
      axis,
      { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
      'percent50',
      '#percent50'
    )
    plotControl1.addTo(
      axis,
      { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
      'control',
      '#control-line'
    )
    plotMedian1.addTo(
      axis,
      { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
      'median',
      '#median-line'
    )
    axis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
  })
}

window.addEventListener('load', onLoad)