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

  var timesdata

  addListenerById('slider-reset-button', () => resetTimeSlider(timesdata, true))

  var target = 40
  var transitionTime = null

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

  function speedDataFormatter(d) {
    if (!d[0] || d[0].x === null) {
      return '-' + 'm/s\t' + '-' + 'kt\t' + '-' + 'km/h'
    }
    var format = d3.format('.1f')
    var value = d[0].y !== null ? format(d[0].y) : '-'
    var knots = !d[0].y !== null ? format(d[0].y * 1.943844) : '-'
    var kmph = !d[0].y !== null ? format(d[0].y * 3.6) : '-'
    return value + 'm/s\t' + knots + 'kt\t' + kmph + 'km/h'
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
        format: (value) => `${value}°`,
      },
      innerRadius: 0.5,
    })
    windDirectionMeasurement = new wbCharts.ChartArrow(windRichtingMetingen[0], {
      transitionTime: transitionTime,
      symbol: { size: 64 },
      radial: { includeInTooltip: false },
      tooltip: { anchor: 'pointer' },
    })
    windDirectionForecast = new wbCharts.ChartArrow(windRichtingVerwachtingen[0], {
      transitionTime: transitionTime,
      symbol: { size: 64 },
      radial: { includeInTooltip: false },
      tooltip: { anchor: 'pointer' },
    })
    windDirectionRange = new wbCharts.ChartRange(allWindSpreidingR[0], {
      transitionTime: transitionTime,
      radial: { includeInTooltip: false },
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
      labelField: { text: 'richting', dy: '-50px' },
      valueField: { dy: '-30px', units: degree },
    })

    polarText1 = new wbCharts.DataField(polarAxis.canvas, {
      selector: ['wind-forecast', 'wind'],
      labelField: { text: 'windsnelheid', dy: '-10px' },
      valueField: [{ dy: '10px', hyphen: ' / ' }, { units: unitsSpeed }],
    })

    polarText2 = new wbCharts.DataField(polarAxis.canvas, {
      selector: 'stoot',
      labelField: { text: 'windstoot', dy: '30px' },
      valueField: { dy: '50px', units: unitsStoot },
    })

    var legendWindRose = new wbCharts.Legend(
      [
        { selector: 'direction-range', label: 'Windrichting spreiding' },
        { selector: 'direction-measured', label: 'Windrichting meting' },
        { selector: 'direction-forecast', label: 'Windrichting verwachting' },
      ],
      document.getElementById('legend-wind-rose')
    )

    // Wind speed chart
    beaufortVisitor = new wbCharts.BeaufortAxis({
      x: { axisIndex: 0 },
      colors: {
        1: 'rgba(255, 255, 255, 0.2)',
        3: 'rgba(255, 255, 255, 0.2)',
        5: 'rgba(255, 255, 255, 0.2)',
        7: 'rgba(255, 255, 255, 0.2)',
        9: 'rgba(255, 255, 255, 0.2)',
        11: 'rgba(255, 255, 255, 0.2)',
      },
    })

    var containerWindSpeed = document.getElementById('chart-wind-speed')
    windSpeedAxis = new wbCharts.CartesianAxes(containerWindSpeed, null, null, {
      transitionTime: transitionTime,
      x: [
        {
          unit: 'm/s',
          domain: [0, 40],
          position: 'bottom',
          showGrid: true,
        },
        {
          position: 'top',
          unit: 'Bft',
        },
      ],
      y: [{ position: 'left' }],
      margin: {
        right: 60,
        left: 60,
        bottom: 60,
      },
    })

    windSpeedRange = new wbCharts.ChartRange(allWindSpreidingV[0], {
      transitionTime: transitionTime,
      y: { includeInTooltip: false },
      tooltip: { anchor: 'center' },
    })
    windSpeedMeasurement = new wbCharts.ChartLine(windSnelheiMetingen[0], {
      transitionTime: transitionTime,
      y: { includeInTooltip: false },
      tooltip: { anchor: 'pointer' },
    })
    windSpeedForecast = new wbCharts.ChartLine(windSnelheiVerwachtingen[0], {
      transitionTime: transitionTime,
      y: { includeInTooltip: false },
      tooltip: { anchor: 'pointer' },
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
      '#wind-forecast-line'
    )

    windAmplitudeText = new wbCharts.DataField(
      windSpeedAxis.canvas,
      {
        selector: 'wind',
        labelField: { text: 'windsnelheid', dy: '80px' },
        valueField: { dx: '100px', dy: '80px' },
      },
      speedDataFormatter
    )

    // Wind stoot chart
    var containerWindstoot = document.getElementById('chart-wind-stoot')
    windStootAxis = new wbCharts.CartesianAxes(containerWindstoot, null, null, {
      transitionTime: transitionTime,
      x: [
        {
          unit: 'm/s',
          domain: [0, 40],
          position: 'bottom',
          showGrid: true,
        },
      ],
      margin: {
        right: 60,
        left: 60,
        bottom: 60,
      },
    })
    windStootChart = new wbCharts.ChartLine(allWindStoot[0], {
      transitionTime: transitionTime,
      y: { includeInTooltip: false },
      tooltip: { anchor: 'default' },
    })
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
        labelField: { text: 'windstoot', dy: '80px' },
        valueField: { dx: '100px', dy: '80px' },
      },
      speedDataFormatter
    )

    // Time chart wind speed
    beaufortVisitor1 = new wbCharts.BeaufortAxis({
      y: { axisIndex: 0 },
      colors: {
        0: 'rgba(255, 255, 255, 0.2)',
        1: 'rgba(174, 241, 249, 0.2)',
        2: 'rgba(150, 247, 220, 0.2)',
        3: 'rgba(150, 247, 180, 0.2)',
        4: 'rgba(111, 244, 111, 0.2)',
        5: 'rgba(115, 237, 19, 0.2)',
        6: 'rgba(164, 237, 18, 0.2)',
        7: 'rgba(218, 237, 19, 0.2)',
        8: 'rgba(237, 194, 18, 0.2)',
        9: 'rgba(237, 143, 18, 0.2)',
        10: 'rgba(237, 99, 18, 0.2)',
        11: 'rgba(237, 41, 17, 0.2)',
        12: 'rgba(213, 16, 44, 0.2)',
      },
    })

    var containerWindSpeedTime = document.getElementById('chart-wind-speed-time')
    windTimeAxis = new wbCharts.CartesianAxes(containerWindSpeedTime, null, null, {
      transitionTime: transitionTime,
      x: [{ type: 'time', position: 'bottom', showGrid: true }],
      y: [
        {
          label: 'windsnelheid',
          unit: 'm/s',
          domain: [0, 40],
          position: 'left',
          showGrid: true,
        },
        {
          position: 'right',
          unit: 'Bft',
        },
      ],
      margin: {
        right: 60,
        left: 60,
      },
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
    //
    windSpeedTimeF.addTo(
      windTimeAxis,
      { x: { key: 't', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
      'wind-forecast',
      '#wind-forecast-line-time'
    )

    var legendWindTime = new wbCharts.Legend(
      [
        { selector: 'windstoot', label: 'Windstoot meting' },
        { selector: 'wind', label: 'Windsnelheid meting' },
        { selector: 'wind-forecast', label: 'Windsnelheid verwachting' },
      ],
      document.getElementById('legend-wind-speed-time')
    )
    // Time chart wind direction
    var containerWindDirectionTme = document.getElementById('chart-wind-direction-time')
    windDirectionTimeAxis = new wbCharts.CartesianAxes(containerWindDirectionTme, null, null, {
      transitionTime: transitionTime,
      x: [{ type: 'time', position: 'bottom', showGrid: true }],
      y: [
        {
          label: 'windrichting',
          unit: '°',
          type: 'degrees',
          domain: [0, 360],
          position: 'left',
          showGrid: true,
        },
      ],
      margin: {
        right: 60,
        left: 60,
      },
    })
    windDirectionTimeM = new wbCharts.ChartLine(
      [
        { t: 0, y: 0 },
        { t: 1, y: 0 },
      ],
      { transitionTime: transitionTime }
    )
    windDirectionTimeF = new wbCharts.ChartLine(
      [
        { t: 0, y: 0 },
        { t: 1, y: 0 },
      ],
      { transitionTime: transitionTime }
    )
    windDirectionTimeM.addTo(
      windDirectionTimeAxis,
      { x: { key: 't', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
      'winddirection',
      '#winddirection-line-time'
    )
    windDirectionTimeF.addTo(
      windDirectionTimeAxis,
      { x: { key: 't', axisIndex: 0 }, y: { key: 'y', axisIndex: 0 } },
      'winddirection-forecast',
      '#winddirection-forecast-line-time'
    )

    var legendWindDirectionTime = new wbCharts.Legend(
      [
        { selector: 'winddirection', label: 'Windrichting meting' },
        { selector: 'winddirection-forecast', label: 'Windrichting verwachting' },
      ],
      document.getElementById('legend-wind-direction-time')
    )

    // Draw
    windSpeedAxis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
    windStootAxis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
    polarAxis.redraw()
    windTimeAxis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
    windDirectionTimeAxis.redraw({ x: { autoScale: true }, y: { autoScale: true } })

    // Add visitors
    polarAxis.accept(polarText)
    polarAxis.accept(legendWindRose)
    windSpeedAxis.accept(polarText1)
    windSpeedAxis.accept(windAmplitudeText)
    windSpeedAxis.accept(beaufortVisitor)
    windStootAxis.accept(windStootText)
    windStootAxis.accept(polarText2)
    windTimeAxis.accept(legendWindTime)
    windTimeAxis.accept(beaufortVisitor1)

    windDirectionTimeAxis.accept(legendWindDirectionTime)
    windDirectionTimeAxis.accept(new wbCharts.ZoomHandler())
    windDirectionTimeAxis.accept(new wbCharts.CurrentTime({ x: { axisIndex: 0 } }))

    var sliderdt = document.getElementById('slider-datetime')
    // var timezone = 'Etc/GMT' + windTimeAxis.timeZoneOffset/60;
    var dateFormatter = wbCharts.dateFormatter
    sliderdt.innerHTML = dateFormatter(new Date(times[0] * 1000), 'yyyy-MM-DD HH:mm ZZZZ', {
      timeZone: 'Europe/Amsterdam',
    })
  }

  function updateChartWindTime(windSpeedTimeSeriesM, windSpeedTimeSeriesF, windStootTimeSeriesM) {
    windSpeedTimeM.data = windSpeedTimeSeriesM
    windSpeedTimeF.data = windSpeedTimeSeriesF
    windStootTimeM.data = windStootTimeSeriesM

    windTimeAxis.redraw({ x: { autoScale: true } })
    windTimeAxis.accept(new wbCharts.ZoomHandler())
    var mouseOverWindTime = new wbCharts.MouseOver(['windstoot', 'wind', 'wind-forecast'])
    windTimeAxis.accept(mouseOverWindTime)
    windTimeAxis.accept(new wbCharts.CurrentTime({ x: { axisIndex: 0 } }))
  }

  function updateChartWindDirectionTime(windDirectionTimeSeriesM, windDirectionTimeSeriesF) {
    windDirectionTimeM.data = windDirectionTimeSeriesM
    windDirectionTimeF.data = windDirectionTimeSeriesF
    windDirectionTimeAxis.redraw({ x: { autoScale: true } })

    var mouseOverWindDirectionTime = new wbCharts.MouseOver([
      'winddirection',
      'winddirection-forecast',
    ])
    windDirectionTimeAxis.accept(new wbCharts.ZoomHandler())
    windDirectionTimeAxis.accept(mouseOverWindDirectionTime)
    windDirectionTimeAxis.accept(new wbCharts.CurrentTime({ x: { axisIndex: 0 } }))
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

      polarAxis.redraw()
      windSpeedAxis.redraw({ x: { autoScale: true }, y: { autoScale: true } })
      windStootAxis.redraw({ x: { autoScale: true }, y: { autoScale: true } })

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
            windSpeedTimeSeriesM.push({ t: dateTime, y: val })
            windDirectionTimeSeriesM.push({ t: dateTime, y: data.meting.values[i][0] })
            val = data.meting.values[i][2] !== null ? data.meting.values[i][3] * 0.1 : null
            windStootTimeSeriesM.push({ t: dateTime, y: val })
          }
        }

        var windSpeedTimeSeriesF = []
        var windDirectionTimeSeriesF = []
        for (var i = 0; i < data.verwachting.times.length; i++) {
          if (data.verwachting.values[i][0] || data.verwachting.values[i][2]) {
            var dateTime = new Date(data.verwachting.times[i] * 1000)
            windSpeedTimeSeriesF.push({ t: dateTime, y: data.verwachting.values[i][0] * 0.1 })
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

          var metingRichtingData1 = {}
          var metingRichtingData2 = {}

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
        updateChartWindTime(windSpeedTimeSeriesM, windSpeedTimeSeriesF, windStootTimeSeriesM)
        updateChartWindDirectionTime(windDirectionTimeSeriesM, windDirectionTimeSeriesF)

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
