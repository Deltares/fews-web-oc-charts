function onLoad() {
  var containerZoomXY = document.getElementById('chart-container-zoom-xy')
  var containerZoomX = document.getElementById('chart-container-zoom-x')
  var containerZoomY = document.getElementById('chart-container-zoom-y')
  var containerNoZoom = document.getElementById('chart-container-no-zoom')


  console.log(document)
  console.log(containerZoomXY, containerZoomX, containerZoomY, containerNoZoom)
  
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
  var axisZoomXY = new wbCharts.CartesianAxes(containerZoomXY, null, null, axisOptions)
  var axisZoomX = new wbCharts.CartesianAxes(containerZoomX, null, null, axisOptions)
  var axisZoomY = new wbCharts.CartesianAxes(containerZoomY, null, null, axisOptions)
  var axisNoZoom = new wbCharts.CartesianAxes(containerNoZoom, null, null, axisOptions)

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
  var plot1ZoomXY = new wbCharts.ChartLine(data, {})
  var plot2ZoomXY = new wbCharts.ChartLine(data, {})

  var plot1ZoomX = new wbCharts.ChartLine(data, {})
  var plot2ZoomX = new wbCharts.ChartLine(data, {})

  var plot1ZoomY = new wbCharts.ChartLine(data, {})
  var plot2ZoomY = new wbCharts.ChartLine(data, {})

  var plot1NoZoom = new wbCharts.ChartLine(data, {})
  var plot2NoZoom = new wbCharts.ChartLine(data, {})

  var style1 = {
    fill: 'none',
    stroke: 'skyblue',
  }
  var style2 = {
    fill: 'none',
    stroke: 'red',
    'stroke-dasharray': '5,5',
  }

  plot1ZoomXY.addTo(
    axisZoomXY,
    { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
    'local',
    style1
  )
  plot2ZoomXY.addTo(
    axisZoomXY,
    { x: { key: 'x', axisIndex: 1 }, y: { key: 'y', axisIndex: 0 } },
    'mexico',
    style2
  )

  plot1ZoomX.addTo(
    axisZoomX,
    { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
    'local',
    style1
  )
  plot2ZoomX.addTo(
    axisZoomX,
    { x: { key: 'x', axisIndex: 1 }, y: { key: 'y', axisIndex: 0 } },
    'mexico',
    style2
  )

  plot1ZoomY.addTo(
    axisZoomY,
    { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
    'local',
    style1
  )
  plot2ZoomY.addTo(
    axisZoomY,
    { x: { key: 'x', axisIndex: 1 }, y: { key: 'y', axisIndex: 0 } },
    'mexico',
    style2
  )

  plot1NoZoom.addTo(
    axisNoZoom,
    { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
    'local',
    style1
  )
  plot2NoZoom.addTo(
    axisNoZoom,
    { x: { key: 'x', axisIndex: 1 }, y: { key: 'y', axisIndex: 0 } },
    'mexico',
    style2
  )

  var mouseOver = new wbCharts.MouseOver(['local', 'mexico'])

  const zoomHandlerXY = new wbCharts.ZoomHandler((wheelMode = wbCharts.WheelMode.XY))
  axisZoomXY.redraw({ x: { autoScale: true }, y: { autoScale: true } })
  axisZoomXY.accept(zoomHandlerXY)
  axisZoomXY.accept(mouseOver)

  const zoomHandlerX = new wbCharts.ZoomHandler((wheelMode = wbCharts.WheelMode.X))
  axisZoomX.redraw({ x: { autoScale: true }, y: { autoScale: true } })
  axisZoomX.accept(zoomHandlerX)
  axisZoomX.accept(mouseOver)

  const zoomHandlerY = new wbCharts.ZoomHandler((wheelMode = wbCharts.WheelMode.Y))
  axisZoomY.redraw({ x: { autoScale: true }, y: { autoScale: true } })
  axisZoomY.accept(zoomHandlerY)
  axisZoomY.accept(mouseOver)

  const zoomHandlerNoWheel = new wbCharts.ZoomHandler()
  axisNoZoom.redraw({ x: { autoScale: true }, y: { autoScale: true } })
  axisNoZoom.accept(zoomHandlerNoWheel)
  axisNoZoom.accept(mouseOver)
}

window.addEventListener('load', onLoad)