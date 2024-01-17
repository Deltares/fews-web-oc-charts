function onLoad() {
  var container = document.getElementById('chart-container-1')
  var axisOptions = {
    x: [
      {
        type: 'time',
        position: wbCharts.AxisPosition.Bottom,
        showGrid: true,
      },
      {
        type: 'time',
        position: wbCharts.AxisPosition.Top,
        showGrid: true,
        locale: 'es-MX',
        timeZone: 'Mexico/General',
      },
    ],
    y: [
      {
        label: 'Sine',
        position: wbCharts.AxisPosition.Left,
        unit: '-',
        showGrid: true,
        domain: [-1.1, 1.1],
      },
    ],
    margin: {
      left: 50,
      right: 50,
    },
  }
  var axis = new wbCharts.CartesianAxes(container, null, null, axisOptions)

  // Generate time series with a sine function at every day; generate dates
  // in UTC.
  var startDate = new Date(2021, 8, 15)
  var numDays = 1
  var frequency = 3
  var step = 0.01 // in days

  var data = []
  var startTime = startDate.getTime()
  var numSteps = numDays / step
  for (var i = 0; i < numSteps; i++) {
    var curTime = startTime + i * step * 24 * 60 * 60 * 1000
    data.push({
      x: new Date(curTime),
      y: Math.sin(2 * Math.PI * frequency * i * step),
    })
  }
  var plot1 = new wbCharts.ChartLine(data, {})
  var plot2 = new wbCharts.ChartLine(data, {})

  var style1 = {
    fill: 'none',
    stroke: 'skyblue',
  }
  var style2 = {
    fill: 'none',
    stroke: 'red',
    'stroke-dasharray': '5,5',
  }
  plot1.addTo(
    axis,
    { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
    'local',
    style1
  )
  plot2.addTo(
    axis,
    { x: { key: 'x', axisIndex: 1 }, y: { key: 'y', axisIndex: 0 } },
    'mexico',
    style2
  )

  var mouseOver = new wbCharts.MouseOver(['local', 'mexico'])
  var zoomHandler = new wbCharts.ZoomHandler()

  axis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
  axis.accept(zoomHandler)
  axis.accept(mouseOver)
}

window.addEventListener('load', onLoad)
