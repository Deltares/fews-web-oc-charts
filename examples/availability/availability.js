function onLoad() {
  const colorMap = function (value) {
    const colors = {
      validated: '#2fcc66',
      filled: '#1e7b3f',
      warning: 'yellow',
      error: 'red',
      unvalidated: 'grey',
    }
    return colors[value]
  }

  // set constants
  var container1 = document.getElementById('chart-container-1')
  var axis1 = new wbCharts.CartesianAxes(container1, null, null, {
    margin: {
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    x: [
      {
        type: 'band',
        position: 'top',
      },
    ],
    y: [
      {
        type: 'band',
      },
    ],
  })

  var container2 = document.getElementById('chart-container-2')
  var axis2 = new wbCharts.CartesianAxes(container2, null, null, {
    margin: {
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    x: [
      {
        type: 'band',
        position: 'top',
      },
    ],
    y: [
      {
        type: 'band',
      },
    ],
  })

  d3.json('available_aberdeen.json').then((data) => {
    var plotMatrix1 = new wbCharts.ChartMatrix(data, {
      x: {
        paddingOuter: 0,
        paddingInner: 0.4,
      },
      y: {
        paddingOuter: 0,
        paddingInner: 0,
      },
      color: {
        map: colorMap,
      },
      tooltip: {
        anchor: 'top',
      },
    })
    plotMatrix1.addTo(
      axis1,
      {
        x: {
          key: 'date',
          axisIndex: 0,
        },
        y: {
          key: 'series',
          axisIndex: 0,
        },
        color: {
          key: 'value',
        },
      },
      'matrix',
      {}
    )

    axis1.redraw({})
  })

  d3.json('available_aberdeen.json').then((data) => {
    var plotMatrix2 = new wbCharts.ChartMatrix(data, {
      x: {
        paddingOuter: 0,
        paddingInner: 0.4,
      },
      y: {
        paddingOuter: 0,
        paddingInner: 0.1,
      },
      color: {
        map: colorMap,
      },
      tooltip: {
        anchor: 'top',
      },
    })
    plotMatrix2.addTo(
      axis2,
      {
        x: {
          key: 'date',
          axisIndex: 0,
        },
        y: {
          key: 'series',
          axisIndex: 0,
        },
        color: {
          key: 'value',
        },
      },
      'matrix',
      {}
    )

    axis2.redraw({})
  })
}

window.onload = onLoad
