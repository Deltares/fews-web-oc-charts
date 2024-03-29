function onLoad() {
  // set constants b]

  var startDay = new Date(Date.now())
  startDay.setMinutes(0)
  startDay.setHours(0)
  startDay.setSeconds(0)
  var endDay = new Date(startDay)
  endDay.setHours(12)

  now = new Date(startDay)
  now.setHours(8)

  p0 = new Date(startDay)
  p0.setHours(2)

  a0 = new Date(p0)
  a0.setMinutes(15)

  p1 = new Date(startDay)
  p1.setHours(5)

  a1 = new Date(p1)
  a1.setMinutes(15)

  p2 = new Date(startDay)
  p2.setHours(9)

  a2 = new Date(p2)
  a2.setMinutes(15)

  p3 = new Date(startDay)
  p3.setHours(10)

  a3 = new Date(p3)
  a3.setMinutes(15)

  dateFormat = new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).format

  var container1 = document.getElementById('chart-1')
  var polarAxis1 = new wbCharts.PolarAxes(container1, null, null, {
    angular: {
      direction: -1,
      range: [0, 2 * Math.PI],
      intercept: Math.PI / 2,
      domain: [startDay, endDay],
      type: 'time',
      format: dateFormat,
      showgrid: false,
    },
    radial: {
      type: 'band',
      showgrid: false,
    },
    innerRadius: 0.5,
  })

  var container2 = document.getElementById('chart-2')
  var polarAxis2 = new wbCharts.PolarAxes(container2, null, null, {
    angular: {
      direction: -1,
      range: [Math.PI / 3, (5 * Math.PI) / 3],
      intercept: Math.PI / 2,
      domain: [p0, p3],
      type: 'time',
      format: dateFormat,
      showgrid: false,
    },
    radial: {
      type: 'band',
      showgrid: false,
    },
    innerRadius: 0.5,
  })

  var planning = [
    {
      x: 'HIRLAM',
      y: [p0, p1],
      v: 0,
    },
    {
      x: 'DCSMv6',
      y: [p1, p2],
      v: 1,
    },
    {
      x: 'DCSMv6-KF',
      y: [p1, p3],
      v: 2,
    },
  ]
  var progressData = [
    {
      x: 'HIRLAM',
      y: [a0, a1],
      v: 0,
    },
    {
      x: 'DCSMv6',
      y: [a1, now],
      v: 1,
    },
    {
      x: 'DCSMv6-KF',
      y: [a1, now],
      v: 2,
    },
  ]

  var expextedData = [
    {
      x: 'HIRLAM',
      y: [a0, a1],
      v: 0,
    },
    {
      x: 'DCSMv6',
      y: [a1, a2],
      v: 1,
    },
    {
      x: 'DCSMv6-KF',
      y: [a1, a3],
      v: 2,
    },
  ]

  var planned = new wbCharts.ChartProgress(planning, {
    colorScale: wbCharts.AUTO_SCALE,
    t: {
      format: dateFormat,
    },
    style: {
      fill: 'none',
      'stroke-width': '2px',
      stroke: 'currentColor',
      'stroke-dasharray': '5 5',
    },
  })
  var progress = new wbCharts.ChartProgress(progressData, {
    colorScale: wbCharts.AUTO_SCALE,
    t: {
      format: dateFormat,
    },
  })
  var expected = new wbCharts.ChartProgress(expextedData, {
    colorScale: wbCharts.AUTO_SCALE,
    t: {
      format: dateFormat,
    },
    style: {
      'fill-opacity': '.1',
    },
  })

  expected.addTo(polarAxis1, {
    radial: {
      key: 'x',
    },
    angular: {
      key: 'y',
    },
    color: {
      key: 'v',
    },
  })
  progress.addTo(polarAxis1, {
    radial: {
      key: 'x',
    },
    angular: {
      key: 'y',
    },
    color: {
      key: 'v',
    },
  })
  planned.addTo(polarAxis1, {
    radial: {
      key: 'x',
    },
    angular: {
      key: 'y',
    },
    color: {
      key: 'v',
    },
  })

  polarAxis1.redraw()

  var planned2 = new wbCharts.ChartProgress(planning, {
    colorScale: wbCharts.AUTO_SCALE,
    t: {
      format: dateFormat,
    },
    style: {
      fill: 'none',
      'stroke-width': '2px',
      stroke: 'currentColor',
      'stroke-dasharray': '5 5',
    },
  })
  var progress2 = new wbCharts.ChartProgress(progressData, {
    colorScale: wbCharts.AUTO_SCALE,
    t: {
      format: dateFormat,
    },
  })

  var expected2 = new wbCharts.ChartProgress(expextedData, {
    colorScale: wbCharts.AUTO_SCALE,
    t: {
      format: dateFormat,
    },
    style: {
      'fill-opacity': '.1',
    },
  })

  expected2.addTo(polarAxis1, {
    radial: {
      key: 'x',
      axisIndex: 0,
    },
    angular: {
      key: 'y',
      axisIndex: 0,
    },
    color: {
      key: 'v',
    },
  })
  progress2.addTo(polarAxis1, {
    radial: {
      key: 'x',
      axisIndex: 0,
    },
    angular: {
      key: 'y',
      axisIndex: 0,
    },
    color: {
      key: 'v',
    },
  })
  planned2.addTo(polarAxis1, {
    radial: {
      key: 'x',
      axisIndex: 0,
    },
    angular: {
      key: 'y',
      axisIndex: 0,
    },
    color: {
      key: 'v',
    },
  })
  polarAxis2.redraw()

  function saveSvgAsPng(svgElement, name) {
    const bbox = svgElement.getBoundingClientRect()
    console.log(bbox)
    let svgString = wbCharts.getSvgAsString(svgElement)
    console.log('svgString', svgString)
    wbCharts.svgStringToImage(svgString, 2 * bbox.width, 2 * bbox.height, save)

    function save(dataBlob, filesize) {
      saveAs(dataBlob, `${name}.png`)
    }
  }

  function saveSvg(svgElement, name) {
    let svgString = wbCharts.getSvgAsString(svgElement)
    let preface = '<?xml version="1.0" standalone="no"?>\r\n'
    let svgBlob = new Blob([preface, svgString], {
      type: 'image/svg+xml;charset=utf-8',
    })
    let svgUrl = URL.createObjectURL(svgBlob)
    let downloadLink = document.createElement('a')
    downloadLink.href = svgUrl
    downloadLink.download = `${name}.svg`
    document.body.appendChild(downloadLink)
    downloadLink.click()
    document.body.removeChild(downloadLink)
  }

  function download() {
    let element = document.getElementById('1')
    console.log('save', element.children[0])
    saveSvgAsPng(element.children[0], 'hello')
  }

  function togglePrintSheet() {
    let status
    for (let i = 0; i < document.styleSheets.length; i++) {
      const s = document.styleSheets[i]
      console.log(s.href)
      if (s.href !== undefined && s.href.match(/wb-charts-dark\.css/)) {
        s.disabled = !s.disabled
        status = s.disabled
      }
    }
    for (let i = 0; i < document.styleSheets.length; i++) {
      const s = document.styleSheets[i]
      console.log(s.href)
      if (s.href !== undefined && s.href.match(/wb-charts-print\.css/)) {
        s.disabled = !status
        console.log(s.disabled)
      }
    }
  }

  addListenerById('download-btn', 'click', download)
  addListenerById('toggle-print-sheet', 'click', togglePrintSheet)
}

window.addEventListener('load', onLoad)
