function onLoad() {

  function createData() {
    var currentTime = new Date()
    var timeStep = 5 * 60 * 60 * 1000 // 5 minutes
    var windDirectionData = [
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
    return windDirectionData
  }

  var windDirectionData = createData()

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
  var windDirectionModel = new wbCharts.ChartLine(windDirectionData, {})
  windDirectionModel.addTo(axis, { x: { key: 't', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
    'winddirection',
    '#winddirection-line-time'
  )

  var legendWindDirection = new wbCharts.Legend(
    [
      { selector: 'winddirection', label: 'Windrichting meting' },
    ],
    document.getElementById('legend-wind-direction-time')
  )

  var mouseOver = new wbCharts.MouseOver(['winddirection'])

  axis.redraw({ x: { autoScale: true }, y: { autoScale: true } })

  axis.accept(mouseOver)
  axis.accept(legendWindDirection)

  function updateData(windDirectionChart, windDirectionAxis) {
    var windDirectionData = createData()
    windDirectionChart.data = windDirectionData
    windDirectionAxis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
  }

  addListenerById('update-data-button', 'click', () => updateData(windDirectionModel, axis))
}

window.addEventListener('load', onLoad)
