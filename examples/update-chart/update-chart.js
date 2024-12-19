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
  var chartContainer = document.getElementById('chart-wind-direction-time')
  var windDirAxis = new wbCharts.CartesianAxes(chartContainer, null, null, {
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
  })

  // Create wind rose
  var containerWindrose = document.getElementById('chart-wind-rose')
  windRoseAxis = new wbCharts.PolarAxes(containerWindrose, null, null, {
    angular: {
      direction: wbCharts.Direction.CLOCKWISE,
      intercept: Math.PI / 2,
      format: (value) => `${value}°`,
    },
    innerRadius: 0.5,
  })

  // Create data and add to chart and windrose
  var windDirObservedData = createData()
  var windDirObsChartLine = new wbCharts.ChartLine(windDirObservedData, {})
  windDirObsChartLine.addTo(windDirAxis, { x: { key: 't', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
    'winddirection',
    '#winddirection-line-time'
  )

  var windDirModelData = createData()
  var windDirModelChart = new wbCharts.ChartLine(windDirModelData, {})
  windDirModelChart.addTo(windDirAxis, { x: { key: 't', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
    'winddirection-forecast',
    '#winddirection-forecast-line-time'
  )

  function cartesianDataToArrowData(data) {
    var input = document.getElementById('slider')
    return [{
      x: [1,0],
      y: [data[input.value].y, data[input.value].y]
    }]
  }

  windDirObsChartArrow = new wbCharts.ChartArrow(cartesianDataToArrowData(windDirObservedData),
  {
    transitionTime: null,
    symbol: { size: 64 },
    radial: { includeInTooltip: false },
    tooltip: { anchor: 'pointer' },
  })
  windDirObsChartArrow.addTo(
    windRoseAxis,
    { radial: { key: 'x' }, angular: { key: 'y' } },
    'direction-measured',
    '#polar-line'
  )

  windDirModelChartArrow = new wbCharts.ChartArrow(cartesianDataToArrowData(windDirModelData),
  {
    transitionTime: null,
    symbol: { size: 64 },
    radial: { includeInTooltip: false },
    tooltip: { anchor: 'pointer' },
  })
  windDirModelChartArrow.addTo(
    windRoseAxis,
    { radial: { key: 'x' }, angular: { key: 'y' } },
    'direction-forecast',
    '#polar-line-forecast'
  )

  // Create legend and other visitors
  var legendWindDirection = new wbCharts.Legend(
    [
      { selector: 'winddirection', label: 'Windrichting meting' },
      { selector: 'winddirection-forecast', label: 'Windrichting model' },
    ],
    document.getElementById('legend-wind-direction-time')
  )
  var legendWindRose = new wbCharts.Legend(
    [
      { selector: 'direction-measured', label: 'Windrichting meting' },
      { selector: 'direction-forecast', label: 'Windrichting verwachting' },
    ],
    document.getElementById('legend-wind-rose')
  )

  var mouseOver = new wbCharts.MouseOver(['winddirection', 'winddirection-forecast'])

  // Draw chart and add visitors
  windDirAxis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
  windDirAxis.accept(mouseOver)
  windDirAxis.accept(legendWindDirection)

  windRoseAxis.redraw()
  windRoseAxis.accept(legendWindRose)

  function updateData(windDirObsChartLine, windDirModelChart, windDirectionAxis) {
    // New data
    windDirObservedData = createData()
    windDirModelData = createData()

    // Update the line chart
    windDirObsChartLine.data = windDirObservedData
    windDirModelChart.data = windDirModelData
    windDirectionAxis.redraw({ x: { autoScale: true }, y: { autoScale: true } })

    // Update the windrose
    windDirObsChartArrow.data = cartesianDataToArrowData(windDirObservedData)
    windDirModelChartArrow.data = cartesianDataToArrowData(windDirModelData)
    windRoseAxis.redraw()
  }

  addListenerById('update-data-button', 'click', () => updateData(windDirObsChartLine, windDirModelChart, windDirAxis))
  var input = document.getElementById('slider')
  input.onchange = function () {
    windDirObsChartArrow.data = cartesianDataToArrowData(windDirObservedData)
    windDirModelChartArrow.data = cartesianDataToArrowData(windDirModelData)
    windRoseAxis.redraw()
  }
}

window.addEventListener('load', onLoad)
