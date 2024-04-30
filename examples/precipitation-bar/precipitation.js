function onLoad() {
  var container = document.getElementById('chart-container-1')
  var axis = new wbCharts.CartesianAxes(container, null, null, {
    x: [{ type: 'time', showGrid: true }],
    y: [
      { label: 'Precipitation', unit: 'mm', showGrid: true, domain: [0, 2] },
      { label: 'Precipitation Probability', unit: '%', showGrid: false, domain: [0, 100], position: 'right'  },
    ],
    margin: { left: 50, right: 50 },
  })

  var mouseOver = new wbCharts.MouseOver(['precipitationContour', 'precipitationProbability', 'precipitation'])
  var zoom = new wbCharts.ZoomHandler()
  var currentTime = new wbCharts.CurrentTime({ x: { axisIndex: 0 } })

  function dataload() {
    d3.json('./open-meteo.json').then(function (data) {
      const precipitation = []
      const precipitationProbability = []
      const precipitationProbabilityArea = []

      data.hourly.time.forEach(function (t, i) {
        var dateTime = new Date(t)
        precipitation.push({ x: dateTime, y: data.hourly.precipitation[i] })
        precipitationProbability.push({ x: dateTime, y: data.hourly.precipitation_probability[i] })
        precipitationProbabilityArea.push({ x: dateTime, y: [0, data.hourly.precipitation_probability[i]] })
      })

      var plotPrecipitation = new wbCharts.ChartBar(precipitation, {})
      var plotPrecipitationContour = new wbCharts.ChartMarker(precipitation, { tooltip: { alignment: 'right' } })
      var plotPrecipitationProbability = new wbCharts.ChartLine(precipitationProbability, {})
      // var plotPrecipitationProbabilityArea = new wbCharts.ChartArea(precipitationProbability, { curve: 'stepBefore'})
      // plotPrecipitationProbabilityArea.addTo(
      //   axis,
      //   { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 1 } },
      //   'precipitationProbabilityArea',
      //   { fill: 'rgba(44, 175, 254, .5)', stroke: 'none' }
      // )

      plotPrecipitationProbability.addTo(
        axis,
        { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 1 } },
        'precipitationProbability',
        { fill: 'none', stroke: 'rgb(44, 175, 254)' }
      )

      plotPrecipitation.addTo(
        axis,
        { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
        'precipitation',
        { fill: 'rgba(84, 79, 197, .2)', stroke: 'none' }
      )

      plotPrecipitationContour.addTo(
        axis,
        { x: { key: 'x', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
        'precipitationContour',
        { fill: 'none', stroke: 'currentColor' }
      )

      axis.accept(currentTime)
      axis.redraw({ x: { autoScale: true } })
      axis.zoom()
      axis.accept(zoom)
      axis.accept(mouseOver)
    })
  }
  window.setTimeout(dataload, 1)
}

window.addEventListener('load', onLoad)
