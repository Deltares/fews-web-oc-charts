function onLoad() {
  var containerZoom0 = document.getElementById('chart-container-0')
  var containerZoom1 = document.getElementById('chart-container-1')
  var containerZoom2 = document.getElementById('chart-container-2')
  var containerZoom3 = document.getElementById('chart-container-3')
  var containerZoom4 = document.getElementById('chart-container-4')
  var containerZoom5 = document.getElementById('chart-container-5')

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
  var axisZoom0 = new wbCharts.CartesianAxes(containerZoom0, null, null, axisOptions)
  var axisZoom1 = new wbCharts.CartesianAxes(containerZoom1, null, null, axisOptions)
  var axisZoom2 = new wbCharts.CartesianAxes(containerZoom2, null, null, axisOptions)
  var axisZoom3 = new wbCharts.CartesianAxes(containerZoom3, null, null, axisOptions)
  var axisZoom4 = new wbCharts.CartesianAxes(containerZoom4, null, null, axisOptions)
  var axisZoom5 = new wbCharts.CartesianAxes(containerZoom5, null, null, axisOptions)
  const axes = [axisZoom0, axisZoom1, axisZoom2, axisZoom3, axisZoom4, axisZoom5]

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

  var startDate = new Date(2021, 8, 14)
  var numDays = 3
  var frequency = 3
  var step = 0.01 // in days

  var data2 = []
  var startTime = startDate.getTime()

  var numSteps = numDays / step
  for (var i = 0; i < numSteps; i++) {
    var curTime = startTime + i * step * 24 * 60 * 60 * 1000
    data2.push({
      x: new Date(curTime),
      y: Math.sin(2 * Math.PI * frequency * i * step),
    })
  }
  var style1 = {
    fill: 'none',
    stroke: 'skyblue',
  }
  var style2 = {
    fill: 'none',
    stroke: 'red',
    'stroke-dasharray': '5,5',
  }

  axes.forEach((axis, i) => {
    var plot1 = new wbCharts.ChartLine(i % 2 === 0 ? data : data2, {})
    var plot2 = new wbCharts.ChartLine(i % 2 === 0 ? data : data2, {})

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
  })

  const zoomHandlerX = new wbCharts.ZoomHandler({
    sharedZoomMode: wbCharts.ZoomMode.X,
    wheelMode: wbCharts.WheelMode.Y,
  })
  axisZoom0.redraw({ x: { autoScale: true }, y: { autoScale: true } })
  axisZoom0.accept(zoomHandlerX)
  axisZoom0.accept(new wbCharts.MouseOver(['local', 'mexico']))

  axisZoom1.redraw({ x: { autoScale: true }, y: { autoScale: true } })
  axisZoom1.accept(zoomHandlerX)
  axisZoom1.accept(new wbCharts.MouseOver(['local', 'mexico']))

  const zoomHandlerY = new wbCharts.ZoomHandler({
    sharedZoomMode: wbCharts.ZoomMode.Y,
    wheelMode: wbCharts.WheelMode.Y,
  })
  axisZoom2.redraw({ x: { autoScale: true }, y: { autoScale: true } })
  axisZoom2.accept(zoomHandlerY)
  axisZoom2.accept(new wbCharts.MouseOver(['local', 'mexico']))

  axisZoom3.redraw({ x: { autoScale: true }, y: { autoScale: true } })
  axisZoom3.accept(zoomHandlerY)
  axisZoom3.accept(new wbCharts.MouseOver(['local', 'mexico']))

  const zoomHandlerXY = new wbCharts.ZoomHandler({
    sharedZoomMode: wbCharts.ZoomMode.XY,
    wheelMode: wbCharts.WheelMode.XY,
  })
  axisZoom4.redraw({ x: { autoScale: true }, y: { autoScale: true } })
  axisZoom4.accept(zoomHandlerXY)
  axisZoom4.accept(new wbCharts.MouseOver(['local', 'mexico']))

  axisZoom5.redraw({ x: { autoScale: true }, y: { autoScale: true } })
  axisZoom5.accept(zoomHandlerXY)
  axisZoom5.accept(new wbCharts.MouseOver(['local', 'mexico']))
}

window.addEventListener('load', onLoad)
