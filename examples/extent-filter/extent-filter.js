function onLoad() {
  var container = document.getElementById('chart-container-1')
  axis = new wbCharts.CartesianAxes(container, null, null, {
    x: [{ type: 'time', showGrid: true }],
    y: [
      { label: 'Precipitation', unit: 'mm', showGrid: true, defaultDomain: [0, 2],  nice: true },
      { label: 'Precipitation Probability', unit: '%', showGrid: false, defaultDomain: [0, 100], position: 'right', nice: false  },
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

      const extentFilter = (d) => {
        return d.y !== 999
      }

      var plotPrecipitation = new wbCharts.ChartArea(precipitation, { curve: 'stepBefore', y: { extentFilter }})
      var plotPrecipitationContour = new wbCharts.ChartMarker(precipitation,  { tooltip: { alignment: 'right'} , y:{ extentFilter } })
      var plotPrecipitationProbability = new wbCharts.ChartLine(precipitationProbability, { y:{ extentFilter } })

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
      axis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
      axis.zoom()
      axis.accept(zoom)
      axis.accept(mouseOver)
    })
  }
  window.setTimeout(dataload, 1)
}

function toggleFilterByIds(ids, active) {
  console.log(ids, active, axis.charts)

  const extentFilter = (d) => {
    return d.y !== 999
  }

  if (active) {
    for (const chart of axis.charts) {
      if (ids.includes(chart.id)) {
      chart.setOptions({y : { extentFilter }})
      }
    }
  } else {
    for (const chart of axis.charts) {
      if (ids.includes(chart.id)) {
        chart.setOptions({y : { extentFilter: () => true } }) }
    }
  }
  axis.redraw({ y: { autoScale: true } })
}

window.addEventListener('load', onLoad)
