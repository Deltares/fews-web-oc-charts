function onLoad() {
  d3.timeFormatDefaultLocale({
    dateTime: '%a %e %B %Y %T',
    date: '%d-%m-%Y',
    time: '%H:%M:%S',
    periods: ['AM', 'PM'],
    days: ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'],
    shortDays: ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'],
    months: [
      'januari',
      'februari',
      'maart',
      'april',
      'mei',
      'juni',
      'juli',
      'augustus',
      'september',
      'oktober',
      'november',
      'december',
    ],
    shortMonths: [
      'jan',
      'feb',
      'mrt',
      'apr',
      'mei',
      'jun',
      'jul',
      'aug',
      'sep',
      'okt',
      'nov',
      'dec',
    ],
  })

  var polarAxis
  var windSpeedAxis
  var windStootAxis
  var windTimeAxis
  var windDirectionTimeAxis

  var beaufortAxis
  var windDirectionMeasurement
  var windDirectionForecast
  var windSpeedMeasurement
  var windSpeedForecast
  var windDirectionRange
  var windSpeedRange
  var windStootChart
  var polarText
  var windSpeedText
  var windStootText

  var windSpeedTimeM
  var windSpeedTimeF
  var windStootTimeM
  var windDirectionTimeM
  var windDirectionTimeF

  var beaufortScale
  var timesdata

  var target = 40
  var transitionTime = null

  addListenerById('slider-reset-button', () => resetTimeSlider(timesdata, true))

  function resetTimeSlider(times, force) {
    var sliderreset = document.getElementById('slider-reset')
    if (!force && !sliderreset.checked) {
      return
    }
    var slider = document.getElementById('slider')
    slider.max = times.length - 1
    var now = Math.floor(Date.now() / 1000)
    var t = 0
    for (t = 0; t < times.length; t++) {
      if (times[t][0] > now) {
        break
      }
    }
    if (t > 0) {
      t--
    }
    for (; t >= 0; t--) {
      if (times[t][1]) {
        break
      }
    }
    slider.value = t
    if (typeof Event === 'function') {
      var event = new Event('change')
    } else {
      // Internet Explorer compatibility
      var event = document.createEvent('Event')
      event.initEvent('change', true, true)
    }

    slider.dispatchEvent(event)
  }

  function getZoomLimit(upperLimit) {
    const zoomLevels = [32.7, 20.8, 10.8]
    var result = upperLimit
    for (i = 0; i < zoomLevels.length; i++) {
      if (upperLimit > zoomLevels[i]) {
        break
      } else {
        result = zoomLevels[i]
      }
    }
    return result
  }

  function updateBeaufortScale(target) {
    const beaufortLimits = [
      0, 0.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7, 40,
    ]
    limits = beaufortLimits.filter(function (x) {
      return x <= target
    })
    beaufortScale.domain(Object.keys(limits))
    beaufortScale.range(
      limits.map(function (x) {
        return (x / target) * windSpeedAxis.width
      })
    )
    return beaufortScale
  }

  function speedDataFormatter(d) {
    if (!d[0] || d[0].x === null) {
      return '-' + '[m/s]\t' + '-' + '[kt]\t' + '-' + '[km/h]'
    }
    var format = d3.format('.1f')
    var value = d[0].y !== null ? format(d[0].y) : '-'
    var knots = !d[0].y !== null ? format(d[0].y * 1.943844) : '-'
    var kmph = !d[0].y !== null ? format(d[0].y * 3.6) : '-'
    return value + '[m/s]\t' + knots + '[kt]\t' + kmph + '[km/h]'
  }

  var unitsSpeed = [
    { unit: ' m/s', factor: 1.0 },
    { unit: ' kt', factor: 1.943844 },
    { unit: ' km/h', factor: 3.6 },
    { unit: ' Bft', scale: wbCharts.scaleBeaufort },
  ]
  var unitsStoot = [
    { unit: ' m/s', factor: 1.0 },
    { unit: ' kt', factor: 1.943844 },
    { unit: ' km/h', factor: 3.6 },
  ]
  var degree = [
    { unit: '°', factor: 1.0, precision: '.0f' },
    { unit: '', scale: wbCharts.scaleWindCategories },
  ]

  function setupWindrose(
    windRichtingMetingen,
    windRichtingVerwachtingen,
    windSnelheiMetingen,
    windSnelheiVerwachtingen,
    allWindSpreidingR,
    allWindSpreidingV,
    allWindStoot,
    times,
    label
  ) {
    // Wind rose chart
    var containerWindrose = document.getElementById('chart-wind-rose')
    polarAxis = new wbCharts.PolarAxes(containerWindrose, null, null, {
      angular: {
        direction: wbCharts.Direction.CLOCKWISE,
        intercept: Math.PI / 2,
      },
      innerRadius: 0.5,
    })
    windDirectionMeasurement = new wbCharts.ChartArrow(windRichtingMetingen[0], {
      transitionTime: transitionTime,
      symbol: { size: 64 },
    })
    windDirectionForecast = new wbCharts.ChartArrow(windRichtingVerwachtingen[0], {
      transitionTime: transitionTime,
      symbol: { size: 64 },
    })
    windDirectionRange = new wbCharts.ChartRange(allWindSpreidingR[0], {
      transitionTime: transitionTime,
      r: { includeInTooltip: false },
      tooltip: { anchor: 'center' },
    })
    windDirectionRange.addTo(
      polarAxis,
      { radial: { key: 'x' }, angular: { key: 'y' } },
      'direction-range',
      '#polar-range'
    )
    windDirectionMeasurement.addTo(
      polarAxis,
      { radial: { key: 'x' }, angular: { key: 'y' } },
      'direction-measured',
      '#polar-line'
    )
    windDirectionForecast.addTo(
      polarAxis,
      { radial: { key: 'x' }, angular: { key: 'y' } },
      'direction-forecast',
      '#polar-line-forecast'
    )

    polarText = new wbCharts.DataField(polarAxis.canvas, {
      selector: 'direction-measured',
      labelField: { text: 'richting' },
      valueField: { units: degree },
    })

    polarText1 = new wbCharts.DataField(polarAxis.canvas, {
      selector: 'wind',
      labelField: { text: 'windsnelheid' },
      valueField: { units: unitsSpeed },
    })

    polarText2 = new wbCharts.DataField(polarAxis.canvas, {
      selector: 'stoot',
      labelField: { text: 'windstoot' },
      valueField: { units: unitsStoot },
    })

    // Wind speed chart
    var containerWindSpeed = document.getElementById('chart-wind-speed')
    windSpeedAxis = new wbCharts.CartesianAxes(containerWindSpeed, null, null, {
      transitionTime: transitionTime,
      x: [
        {
          unit: '[m/s]',
          domain: [0, 40],
          position: 'bottom',
          showGrid: true,
        },
        {
          position: 'top',
          unit: '[Bft]',
        },
      ],
      y: [{ position: 'left' }],
      margin: {
        bottom: 60,
      },
    })
    var zoomLimit = getZoomLimit(target)

    windSpeedRange = new wbCharts.ChartRange(allWindSpreidingV[0], {
      transitionTime: transitionTime,
      x: { includeInTooltip: false },
      tooltip: { anchor: 'center' },
    })
    windSpeedMeasurement = new wbCharts.ChartLine(windSnelheiMetingen[0], {
      transitionTime: transitionTime,
    })
    windSpeedForecast = new wbCharts.ChartLine(windSnelheiVerwachtingen[0], {
      transitionTime: transitionTime,
    })

    windSpeedRange.addTo(
      windSpeedAxis,
      { x: { key: 'y', axisIndex: 0 }, y: { key: 'x', axisIndex: 0 } },
      'cartesian-range',
      '#cartesian-range'
    )
    windSpeedMeasurement.addTo(
      windSpeedAxis,
      { x: { key: 'y', axisIndex: 0 }, y: { key: 'x', axisIndex: 0 } },
      'wind',
      '#wind-line'
    )
    windSpeedForecast.addTo(
      windSpeedAxis,
      { x: { key: 'y', axisIndex: 0 }, y: { key: 'x', axisIndex: 0 } },
      'wind-forecast',
      '#forecast'
    )

    windAmplitudeText = new wbCharts.DataField(
      windSpeedAxis.canvas,
      {
        selector: 'wind',
        labelField: { text: 'windsnelheid' },
      },
      speedDataFormatter
    )

    // Wind stoot chart
    var containerWindstoot = document.getElementById('chart-wind-stoot')
    windStootAxis = new wbCharts.CartesianAxes(containerWindstoot, null, null, {
      transitionTime: transitionTime,
      x: [
        {
          unit: '[m/s]',
          domain: [0, 40],
          position: 'bottom',
          showGrid: true,
        },
      ],
      margin: {
        bottom: 60,
      },
    })
    windStootChart = new wbCharts.ChartLine(allWindStoot[0], { transitionTime: transitionTime })
    windStootChart.addTo(
      windStootAxis,
      { x: { key: 'y', axisIndex: 0 }, y: { key: 'x', axisIndex: 0 } },
      'stoot',
      '#stoot-line'
    )

    windStootText = new wbCharts.DataField(
      windStootAxis.canvas,
      {
        selector: 'stoot',
        labelField: { text: 'windstoot' },
      },
      speedDataFormatter
    )

    // Time chart wind speed
    var containerWindSpeedTime = document.getElementById('chart-wind-speed-time')
    windTimeAxis = new wbCharts.CartesianAxes(containerWindSpeedTime, null, null, {
      transitionTime: transitionTime,
      x: [{ type: 'time', position: 'bottom', showGrid: true }],
      y: [
        {
          label: 'windsnelheid',
          unit: '[m/s]',
          domain: [0, 40],
          position: 'left',
          showGrid: true,
        },
      ],
    })
    windSpeedTimeM = new wbCharts.ChartLine(
      [
        { t: 0, y: 0 },
        { t: 1, y: 0 },
      ],
      { transitionTime: transitionTime }
    )
    windSpeedTimeF = new wbCharts.ChartLine(
      [
        { t: 0, y: 0 },
        { t: 1, y: 0 },
      ],
      { transitionTime: transitionTime }
    )
    windStootTimeM = new wbCharts.ChartLine(
      [
        { t: 0, y: 0 },
        { t: 1, y: 0 },
      ],
      { transitionTime: transitionTime }
    )
    windDirectionTimeM = new wbCharts.ChartMarker(
      [
        { t: 0, y: 0, d: 0 },
        { t: 1, y: 0, d: 0 },
      ],
      { transitionTime: transitionTime, symbol: { size: 32 }, skip: 1 }
    )
    windDirectionTimeF = new wbCharts.ChartDirection(
      [
        { t: 0, y: 0, d: 0 },
        { t: 1, y: 0, d: 0 },
      ],
      { transitionTime: transitionTime, symbol: { size: 64 } }
    )

    windSpeedTimeM.addTo(
      windTimeAxis,
      { x: { key: 't', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
      'wind',
      '#wind-line-time'
    )
    windStootTimeM.addTo(
      windTimeAxis,
      { x: { key: 't', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
      'windstoot',
      '#windstoot-line-time'
    )
    windSpeedTimeF.addTo(
      windTimeAxis,
      { x: { key: 't', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
      'wind-forecast',
      '#forecast-time'
    )
    windDirectionTimeM.addTo(
      windTimeAxis,
      { x: { key: 't', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 }, value: { key: 'y' } },
      'wind',
      '#winddirection-line-time'
    )
    windDirectionTimeF.addTo(
      windTimeAxis,
      { x: { key: 't', axisIndex: 0 }, y: { key: 'd', axisIndex: 0 }, value: { key: 'y' } },
      'winddirection-forecast',
      '#directionforecast-time'
    )

    var legendWindTime = new wbCharts.Legend(
      [
        { selector: 'windstoot', label: 'Windstoot meting' },
        { selector: 'wind', label: 'Windsnelheid meting' },
        { selector: 'wind-forecast', label: 'Windsnelheid verwachting' },
        { selector: 'winddirection-forecast', label: 'Windrichting verwachting' },
      ],
      document.getElementById('legend-wind-speed-time')
    )

    var beaufort = windSpeedAxis.canvas.append('g').attr('class', 'axis x2-axis')

    var limits
    beaufortScale = d3.scaleLinear()
    beaufortScale = updateBeaufortScale(zoomLimit)
    beaufortAxis = d3.axisTop(beaufortScale).tickValues([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    windSpeedAxis.canvas.select('.x2-axis').call(beaufortAxis)

    // Draw
    windSpeedAxis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
    windStootAxis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
    polarAxis.redraw()
    windTimeAxis.redraw({ x: { autoScale: true } })

    // Add visitors
    polarAxis.accept(polarText)
    windSpeedAxis.accept(polarText1)
    windSpeedAxis.accept(windAmplitudeText)
    windStootAxis.accept(windStootText)
    windStootAxis.accept(polarText2)
    windTimeAxis.accept(legendWindTime)

    var sliderdt = document.getElementById('slider-datetime')
    // var timezone = 'Etc/GMT' + windTimeAxis.timeZoneOffset/60;
    var dateFormatter = wbCharts.dateFormatter
    sliderdt.innerHTML = dateFormatter(new Date(times[0] * 1000), 'yyyy-MM-DD HH:mm ZZZZ', {
      timeZone: 'Europe/Amsterdam',
    })
  }

  function updateChartWindTime(
    windSpeedTimeSeriesM,
    windSpeedTimeSeriesF,
    windStootTimeSeriesM,
    windDirectionTimeSeriesM,
    windDirectionTimeSeriesF
  ) {
    windSpeedTimeM.data = windSpeedTimeSeriesM
    windSpeedTimeF.data = windSpeedTimeSeriesF
    windStootTimeM.data = windStootTimeSeriesM
    windDirectionTimeM.data = windSpeedTimeSeriesM
    windDirectionTimeF.data = windDirectionTimeSeriesF

    windTimeAxis.redraw({ x: { autoScale: true } })
    windTimeAxis.accept(new wbCharts.ZoomHandler())
    var mouseOverWindTime = new wbCharts.MouseOver([
      'windstoot',
      'wind',
      'wind-forecast',
      'winddirection-forecast',
    ])
    windTimeAxis.accept(mouseOverWindTime)
    windTimeAxis.accept(new wbCharts.CurrentTime({ x: { axisIndex: 0 } }))
  }

  function updateWindrose(
    windRichtingMetingen,
    windRichtingVerwachtingen,
    windSnelheidMetingen,
    windSnelheidVerwachtingen,
    windSpreidingR,
    windSpreidingV,
    windStoot,
    times,
    label
  ) {
    var updateCharts = function (event) {
      var position = event.target.value
      windDirectionMeasurement.data = windRichtingMetingen[position]
      windDirectionForecast.data = windRichtingVerwachtingen[position]
      windSpeedMeasurement.data = windSnelheidMetingen[position]
      windSpeedForecast.data = windSnelheidVerwachtingen[position]
      windDirectionRange.data = windSpreidingR[position]
      windSpeedRange.data = windSpreidingV[position]
      windStootChart.data = windStoot[position]

      var maxwind = d3.max([
        windSnelheidMetingen[position][0].y,
        windSnelheidVerwachtingen[position][0].y,
        windSpreidingV[position][0].y[1],
        windStoot[position][0].y,
      ])
      var zoomLimit = getZoomLimit(target)
      beaufortScale = updateBeaufortScale(zoomLimit)

      polarAxis.redraw()
      windSpeedAxis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
      windStootAxis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
      windAmplitudeText.redraw()
      polarText.redraw()
      polarText1.redraw()
      polarText2.redraw()
      windStootText.redraw()

      windSpeedAxis.canvas.select('.x2-axis').transition(transitionTime).call(beaufortAxis)

      var sliderdt = document.getElementById('slider-datetime')
      var date = new Date(times[position] * 1000)
      var dateFormatter = wbCharts.dateFormatter
      sliderdt.innerHTML = dateFormatter(
        new Date(times[position] * 1000),
        'yyyy-MM-DD HH:mm ZZZZ',
        { timeZone: 'Europe/Amsterdam' }
      )
    }
    var input = document.getElementById('slider')
    input.onchange = function (event) {
      updateCharts(event)
    }
  }

  function get_wind_data() {
    var request = new XMLHttpRequest()
    request.onreadystatechange = function () {
      if ((this.readyState == 4) & (this.status == 200)) {
        var data = JSON.parse(this.responseText)
        var metingvalues = data.meting.values
        var verwachtingvalues = data.verwachting.values
        var spreidingvalues = data.spreiding.values
        var times = data.meting.times
        timesdata = []

        var windSpeedTimeSeriesM = []
        var windDirectionTimeSeriesM = []
        var windStootTimeSeriesM = []
        for (var i = 0; i < data.meting.times.length; i++) {
          if (data.meting.values[i][0] || data.meting.values[i][2] || data.meting.values[i][3]) {
            var dateTime = new Date(data.meting.times[i] * 1000)
            var val = data.meting.values[i][2] !== null ? data.meting.values[i][2] * 0.1 : null
            windSpeedTimeSeriesM.push({ t: dateTime, y: val, d: data.meting.values[i][0] })
            windDirectionTimeSeriesM.push({ t: dateTime, y: val, d: data.meting.values[i][0] })
            val = data.meting.values[i][2] !== null ? data.meting.values[i][3] * 0.1 : null
            windStootTimeSeriesM.push({ t: dateTime, y: val })
          }
        }

        var windSpeedTimeSeriesF = []
        var windDirectionTimeSeriesF = []
        for (var i = 0; i < data.verwachting.times.length; i++) {
          if (data.verwachting.values[i][0] || data.verwachting.values[i][2]) {
            var dateTime = new Date(data.verwachting.times[i] * 1000)
            windSpeedTimeSeriesF.push({
              t: dateTime,
              y: data.verwachting.values[i][0] * 0.1,
              d: data.verwachting.values[i][1],
            })
            windDirectionTimeSeriesF.push({ t: dateTime, y: data.verwachting.values[i][1] })
          }
        }

        var allWindRichtingMetingen = []
        var allWindRichtingVerwachtingen = []
        var allWindSnelheidMetingen = []
        var allWindSnelheidVerwachtingen = []
        var allWindSpreidingR = []
        var allWindSpreidingV = []
        var allWindStoot = []
        for (var i = 0; i < times.length; i++) {
          var timedatapresent =
            metingvalues[i][0] !== null ||
            metingvalues[i][2] !== null ||
            metingvalues[i][3] !== null
          timesdata.push([times[i], timedatapresent])

          var metingRichtingData = {
            x: [metingvalues[i][0] !== null ? 1 : 0, 0],
            y: [metingvalues[i][0], metingvalues[i][0]],
          }
          allWindRichtingMetingen.push([metingRichtingData])

          var verwachtingRichtingData = {
            x: [verwachtingvalues[i][0] !== null ? 1 : 0, 0],
            y: [verwachtingvalues[i][1], verwachtingvalues[i][1]],
          }
          allWindRichtingVerwachtingen.push([verwachtingRichtingData])

          var metingSnelheidData1 = {}
          var metingSnelheidData2 = {}
          metingSnelheidData1.x = 0
          metingSnelheidData1.y =
            metingvalues[i][2] !== null ? Math.abs(0.1 * metingvalues[i][2]) : null // scale down by factor 10 for m/sec
          metingSnelheidData2.x = metingvalues[i][2] !== null ? 1 : 0
          metingSnelheidData2.y = metingSnelheidData1.y
          allWindSnelheidMetingen.push([metingSnelheidData1, metingSnelheidData2])

          var metingStootData1 = {}
          var metingstootData2 = {}
          metingStootData1.x = 0
          metingStootData1.y =
            metingvalues[i][3] !== null ? Math.abs(0.1 * metingvalues[i][3]) : null // scale down by factor 10 for m/sec
          metingstootData2.x = metingvalues[i][3] !== null ? 1 : 0
          metingstootData2.y = metingStootData1.y
          allWindStoot.push([metingStootData1, metingstootData2])

          var verwachtingSnelheidData1 = {}
          var verwachtingSnelheidData2 = {}
          verwachtingSnelheidData1.x = 0
          verwachtingSnelheidData1.y = Math.abs(0.1 * verwachtingvalues[i][0]) // scale down by factor 10 for m/sec
          verwachtingSnelheidData2.x = verwachtingvalues[i][0] !== null ? 1 : 0
          verwachtingSnelheidData2.y = Math.abs(0.1 * verwachtingvalues[i][0]) // scale down by factor 10 for m/sec
          allWindSnelheidVerwachtingen.push([verwachtingSnelheidData1, verwachtingSnelheidData2])

          var windSpreidingRData = {}
          windSpreidingRData.x = [0, 1]

          if (spreidingvalues[i][3] < spreidingvalues[i][2]) {
            if (spreidingvalues[i][3] < metingvalues[i][0]) {
              windSpreidingRData.y = [spreidingvalues[i][2], spreidingvalues[i][3] + 360]
            } else {
              windSpreidingRData.y = [spreidingvalues[i][2] - 360, spreidingvalues[i][3]]
            }
          } else {
            windSpreidingRData.y = [spreidingvalues[i][2], spreidingvalues[i][3]]
          }
          allWindSpreidingR.push([windSpreidingRData])

          var windSpreidingVData = {}
          windSpreidingVData.x = [0, spreidingvalues[i][0] !== null ? 1 : 0]
          windSpreidingVData.y = [
            0.1 * Math.abs(spreidingvalues[i][0]),
            0.1 * Math.abs(spreidingvalues[i][1]),
          ]
          allWindSpreidingV.push([windSpreidingVData])
        }

        updateWindrose(
          allWindRichtingMetingen,
          allWindRichtingVerwachtingen,
          allWindSnelheidMetingen,
          allWindSnelheidVerwachtingen,
          allWindSpreidingR,
          allWindSpreidingV,
          allWindStoot,
          times,
          'Wind Snelheid en Stoot'
        )
        updateChartWindTime(
          windSpeedTimeSeriesM,
          windSpeedTimeSeriesF,
          windStootTimeSeriesM,
          windSpeedTimeSeriesM,
          windSpeedTimeSeriesF
        )

        // windDirectionTimeSeriesM,
        // windDirectionTimeSeriesF

        resetTimeSlider(timesdata, true)
        setInterval(function () {
          resetTimeSlider(timesdata, false)
        }, 60000)
      }
    }
    var initRange = [[{ x: [0, 1], y: [0, 1], v: 100 }], [{ x: [0, 1], y: [0, 1], v: 100 }]]
    var initScalar = [
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    ]

    setupWindrose(
      initRange,
      initRange,
      initRange,
      initRange,
      initRange,
      initRange,
      initScalar,
      [1],
      'Wind Snelheid en Stoot'
    )
    request.open('GET', '/examples/data/wind_data3.json', true)
    request.send()
  }

  get_wind_data()
}

window.addEventListener('load', onLoad)
