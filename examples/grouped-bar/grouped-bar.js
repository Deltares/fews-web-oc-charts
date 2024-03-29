function onLoad() {
  let keys = {
    x: 'Uitgifte',
    x1: 'Model',
  }

  changed = function (element) {
    keys[element.id] = element.value
    update()
  }

  addListenerById('x', 'change',(event) => { console.log(event); changed(event.target)})
  addListenerById('x1', 'change', (event) => changed(event.target))

  // set constants
  var colorMap = d3.scaleSequential(d3.interpolateRdYlGn).domain([1.4, 1])

  const labelAngle = -45

  var container1 = document.getElementById('chart-container-1')
  var axis1 = new wbCharts.CartesianAxes(container1, null, null, {
    x: [
      {
        type: 'band',
        position: 'bottom',
        labelAngle,
      },
    ],
    y: [
      {
        type: 'value',
        label: 'Waterstand',
        unit: 'm',
        domain: [0, 2],
        labelAngle,
      },
    ],
    margin: {
      bottom: 100,
      left: 100,
      right: 100,
    },
  })

  var containerMatrix = document.getElementById('chart-matrix')
  console.log(containerMatrix)
  var axis3 = new wbCharts.CartesianAxes(containerMatrix, null, null, {
    x: [
      {
        type: 'band',
        position: 'top',
        labelAngle,
      },
    ],
    y: [
      {
        type: 'band',
        position: 'right',
        labelAngle,
      },
    ],
    margin: {
      top: 100,
      left: 100,
      right: 100,
    },
  })

  var plotBars = new wbCharts.ChartBar([], {
    color: {
      map: colorMap,
    },
    x: {
      paddingOuter: 0.05,
      paddingInner: 0.05,
    },
    x1: {
      paddingOuter: 0.05,
      paddingInner: 0.05,
    },
    text: {
      dy: -2,
      attributes: {
        'text-anchor': 'middle',
        'alignment-baseline': 'baseline',
        'pointer-events': 'none',
        stroke: 'none',
        fill: 'white',
        'font-size': '.7rem',
      },
      formatter: (d) => {
        return d['Value'] === null ? '' : d3.format('0.1f')(d['Value'])
      },
    },
    tooltip: {
      anchor: 'bottom',
    },
  })

  plotBars.addTo(
    axis1,
    {
      x: {
        key: keys.x,
        axisIndex: 0,
      },
      x1: {
        key: keys.x1,
      },
      y: {
        key: 'Value',
        axisIndex: 0,
      },
      color: {
        key: 'Value',
      },
    },
    'bars',
    {}
  )

  d3.json('../data/bar_data.json').then((data) => {
    plotBars.data = data

    axis1.redraw({
      x: {
        autoScale: true,
      },
      y: {
        autoScale: true,
      },
    })

    var plotMatrix = new wbCharts.ChartMatrix(data, {
      color: {
        map: colorMap,
      },
      x: {
        paddingOuter: 0.05,
        paddingInner: 0.05,
      },
      y: {
        paddingOuter: 0.05,
        paddingInner: 0.05,
      },
      text: {
        attributes: {
          'text-anchor': 'middle',
          'alignment-baseline': 'middle',
          'pointer-events': 'none',
          stroke: 'none',
          fill: 'black',
        },
        formatter: (d) => {
          return d['Value'] === null ? '' : d3.format('0.1f')(d['Value'])
        },
      },
      tooltip: { anchor: 'top' },
    })
    plotMatrix.addTo(
      axis3,
      {
        x: {
          key: 'Uitgifte',
          axisIndex: 0,
        },
        y: {
          key: 'Model',
          axisIndex: 0,
        },
        color: {
          key: 'Value',
        },
      },
      'matrix',
      {}
    )
    axis3.redraw({})
  })

  update = function () {
    plotBars.setAxisIndex({
      x: {
        key: keys.x,
        axisIndex: 0,
      },
      x1: {
        key: keys.x1,
      },
    })
    axis1.redraw({
      x: {
        autoScale: true,
      },
      y: {
        autoScale: true,
      },
    })
  }
}

window.addEventListener('DOMContentLoaded', onLoad)
