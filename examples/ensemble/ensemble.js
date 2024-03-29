function onLoad() {
  // set constants
  var container1 = document.getElementById('chart-container-1')

  var axis1 = new wbCharts.CartesianAxes(container1, null, null, {
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
        defaultDomain: [-150, 150],
        label: 'Waterstand',
        unit: 'cm',
      },
    ],
    margin: {
      left: 100,
      right: 100,
    },
  })

  var container2 = document.getElementById('chart-container-2')
  var axis = new wbCharts.CartesianAxes(container2, null, null, {
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
  var escalationLevels = [
    {
      id: 'laag',
      events: [],
      levelStart: -80,
      levelEnd: -100,
      color: 'rgba(205, 133, 63,.5)',
      c: '<',
    },
    {
      id: 'verhoogd',
      events: [],
      levelStart: 80,
      levelEnd: 100,
      color: 'rgba(255, 215, 0,.5)',
      c: '>',
    },
    {
      id: 'hoog',
      events: [],
      levelStart: 120,
      levelEnd: 110,
      color: 'rgba(255, 150, 0,.5)',
      c: '>',
    },
    {
      id: 'extreem',
      events: [],
      levelStart: 130,
      levelEnd: 150,
      color: 'rgba(255, 0, 0,.5)',
      c: '>',
    },
  ]
  var warnings = new wbCharts.WarningLevels(escalationLevels)
  var warnings1 = new wbCharts.WarningLevels(escalationLevels)

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
    data.times.forEach(function (time, index) {
      var dateTime = new Date(time * 1000)
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

      escalationLevels.forEach(function (el, i) {
        let val = el.levelStart
        if (index > data.times.length / 2) {
          val = el.levelEnd
        }
        el.events.push({
          date: dateTime,
          value: val,
        })
      })
    })

    for (i = 1; i < nEnsemble; i++) {
      var plotEnsemble = new wbCharts.ChartLine(members[i], {})
      plotEnsemble.addTo(
        axis1,
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
        'ensemble-line',
        '.ensemble-line'
      )
    }
    var plotMedian = new wbCharts.ChartLine(percentiles[0], {})
    var plotControl = new wbCharts.ChartLine(members[0], {})
    plotControl.addTo(
      axis1,
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
      'control-line',
      '#control-line'
    )
    plotMedian.addTo(
      axis1,
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
      'median-line',
      '#median-line'
    )
    axis1.redraw({
      x: {
        autoScale: true,
      },
      y: {
        autoScale: true,
      },
    })
    axis1.accept(warnings)

    var plotControl1 = new wbCharts.ChartMarker(members[0], {})
    var plotMedian1 = new wbCharts.ChartLine(percentiles[0], {})
    var plotPercentile50 = new wbCharts.ChartArea(percentiles[1], {})
    var plotPercentile90 = new wbCharts.ChartArea(percentiles[2], {})

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
      '#percent90'
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
      '#percent50'
    )
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
      'control-line',
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
      'median-line',
      {
        fill: 'none',
        stroke: 'white',
        strokewidth: '2px',
      }
    )
    axis.redraw({
      x: {
        autoScale: true,
      },
      y: {
        autoScale: true,
      },
    })
    axis.accept(warnings1)
  })
}

window.onload = onLoad
