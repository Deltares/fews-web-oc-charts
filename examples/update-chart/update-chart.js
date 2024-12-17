function onLoad() {

  function createData() {
    var currentTime = new Date()
    var timeStep = 5 * 60 * 60 * 1000 // 5 minutes
    var windDirData = [
      {
        t: new Date(currentTime.getTime() - timeStep),
        y: 360*Math.random()
      },
      {
        t: currentTime,
        y: 360*Math.random()
      },
      {
        t: new Date(currentTime.getTime() + timeStep),
        y: 360*Math.random()
      },
    ]
    return windDirData
  }

  // Create wind direction chart
  var axisOptions = {
    x: [
      {
        type: 'time',
        position: wbCharts.AxisPosition.Bottom,
        showGrid: true,
      },
    ],
    y: [
      {
        label: 'windrichting',
        unit: '°',
        type: 'degrees',
        domain: [0, 360],
        position: wbCharts.AxisPosition.Left,
        showGrid: true,
      },
    ],
    margin: {
      left: 50,
      right: 50,
    },
  }
  var chartContainer = document.getElementById('chart-wind-direction-time')
  var axis = new wbCharts.CartesianAxes(chartContainer, null, null, axisOptions)

  // Create data and add to chart
  var windDirObservedData = createData()
  var windDirObsChart = new wbCharts.ChartLine(windDirObservedData, {})
  windDirObsChart.addTo(axis, { x: { key: 't', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
    'winddirection',
    '#winddirection-line-time'
  )

  var windDirModelData = createData()
  var windDirModelChart = new wbCharts.ChartLine(windDirModelData, {})
  windDirModelChart.addTo(axis, { x: { key: 't', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
    'winddirection-forecast',
    '#winddirection-forecast-line-time'
  )

  // Create legend and other visitors
  var legendWindDirection = new wbCharts.Legend(
    [
      { selector: 'winddirection', label: 'Windrichting meting' },
      { selector: 'winddirection-forecast', label: 'Windrichting model' },
    ],
    document.getElementById('legend-wind-direction-time')
  )

  var mouseOver = new wbCharts.MouseOver(['winddirection', 'winddirection-forecast'])

  // Draw chart and add visitors
  axis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
  axis.accept(mouseOver)
  axis.accept(legendWindDirection)

  function updateData(windDirObsChart, windDirModelChart, windDirectionAxis) {
    var windDirObservedData = createData()
    windDirObsChart.data = windDirObservedData

    var windDirModelData = createData()
    windDirModelChart.data = windDirModelData

    windDirectionAxis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
  }

  addListenerById('update-data-button', 'click', () => updateData(windDirObsChart, windDirModelChart, axis))
}

window.addEventListener('load', onLoad)
