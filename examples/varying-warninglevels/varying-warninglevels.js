function onLoad() {
  // CHART
  // set the dimensions and margins of the graph
  var margin = { top: 20, right: 55, bottom: 30, left: 55 },
    width = 900 - margin.left - margin.right,
    height = 380 - margin.top - margin.bottom

  // append the svg object to the body of the page
  var svg1 = d3
    .select('#chart-1')
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')

  var svg2 = d3
    .select('#chart-2')
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')

  // DATA
  const yMax = 400
  const yMin = -300
  const levelsManual = [
    // values spcify the areas
    {
      id: 'low',
      events: [
        { date: new Date(2012, 2, 21), values: [-50, -100] },
        { date: new Date(2012, 2, 22), values: [-40, -80] },
        { date: new Date(2012, 2, 23), values: [-40, -110] },
        { date: new Date(2012, 2, 24), values: [-60, -90] },
        { date: new Date(2012, 2, 25), values: [-50, -100] },
      ],
      color: 'blue',
    },
    {
      id: 'lower',
      events: [
        { date: new Date(2012, 2, 21), values: [-100, -200] },
        { date: new Date(2012, 2, 22), values: [-80, -210] },
        { date: new Date(2012, 2, 23), values: [-110, -180] },
        { date: new Date(2012, 2, 24), values: [-90, -200] },
        { date: new Date(2012, 2, 25), values: [-100, -190] },
      ],
      color: 'green',
    },
    {
      id: 'lowest',
      events: [
        { date: new Date(2012, 2, 21), values: [-200, yMin] },
        { date: new Date(2012, 2, 22), values: [-210, yMin] },
        { date: new Date(2012, 2, 23), values: [-180, yMin] },
        { date: new Date(2012, 2, 24), values: [-200, yMin] },
        { date: new Date(2012, 2, 25), values: [-190, yMin] },
      ],
      color: 'purple',
    },
    {
      id: 'high',
      events: [
        { date: new Date(2012, 2, 21), values: [100, 150] },
        { date: new Date(2012, 2, 22), values: [100, 120] },
        { date: new Date(2012, 2, 23), values: [80, 120] },
        { date: new Date(2012, 2, 24), values: [100, 160] },
        { date: new Date(2012, 2, 25), values: [100, 150] },
      ],
      color: 'orange',
    },
    {
      id: 'higher',
      events: [
        { date: new Date(2012, 2, 21), values: [150, 300] },
        { date: new Date(2012, 2, 22), values: [120, 300] },
        { date: new Date(2012, 2, 23), values: [120, 340] },
        { date: new Date(2012, 2, 24), values: [160, 340] },
        { date: new Date(2012, 2, 25), values: [150, 340] },
      ],
      color: 'red',
    },
    {
      id: 'highest',
      events: [
        { date: new Date(2012, 2, 21), values: [300, yMax] },
        { date: new Date(2012, 2, 23), values: [340, yMax] },
        { date: new Date(2012, 2, 25), values: [340, yMax] },
      ],
      color: 'brown',
    },
    {
      id: 'normal',
      events: [
        { date: new Date(2012, 2, 21), values: [-50, 100] },
        { date: new Date(2012, 2, 22), values: [-40, 100] },
        { date: new Date(2012, 2, 23), values: [-40, 80] },
        { date: new Date(2012, 2, 24), values: [-60, 100] },
        { date: new Date(2012, 2, 25), values: [-50, 100] },
      ],
      color: 'transparent',
    },
  ]

  const thresholds = [
    // value specifies the level, condition specifies if area should be drawn above or below
    {
      id: 'lowest',
      events: [
        { date: new Date(2012, 2, 21), value: -200 },
        { date: new Date(2012, 2, 22), value: -210 },
        { date: new Date(2012, 2, 23), value: -180 },
        { date: new Date(2012, 2, 24), value: -200 },
        { date: new Date(2012, 2, 25), value: -190 },
      ],
      color: 'purple',
      condition: '<',
    },
    {
      id: 'lower',
      events: [
        { date: new Date(2012, 2, 21), value: -100 },
        { date: new Date(2012, 2, 22), value: -80 },
        { date: new Date(2012, 2, 23), value: -110 },
        { date: new Date(2012, 2, 24), value: -90 },
        { date: new Date(2012, 2, 25), value: -100 },
      ],
      color: 'green',
      condition: '<',
    },
    {
      id: 'low',
      events: [
        { date: new Date(2012, 2, 21), value: -50 },
        { date: new Date(2012, 2, 22), value: -40 },
        { date: new Date(2012, 2, 23), value: -40 },
        { date: new Date(2012, 2, 24), value: -60 },
        { date: new Date(2012, 2, 25), value: -50 },
      ],
      color: 'blue',
      condition: '<',
    },
    {
      id: 'high',
      events: [
        { date: new Date(2012, 2, 21), value: 100 },
        { date: new Date(2012, 2, 22), value: 100 },
        { date: new Date(2012, 2, 23), value: 80 },
        { date: new Date(2012, 2, 24), value: 100 },
        { date: new Date(2012, 2, 25), value: 100 },
      ],
      color: 'orange',
      condition: '>',
    },
    {
      id: 'higher',
      events: [
        { date: new Date(2012, 2, 21), value: 150 },
        { date: new Date(2012, 2, 22), value: 120 },
        { date: new Date(2012, 2, 23), value: 120 },
        { date: new Date(2012, 2, 24), value: 160 },
        { date: new Date(2012, 2, 25), value: 150 },
      ],
      color: 'red',
      condition: '>',
    },
    {
      id: 'highest',
      events: [
        { date: new Date(2012, 2, 21), value: 300 },
        { date: new Date(2012, 2, 22), value: 300 },
        { date: new Date(2012, 2, 23), value: 340 },
        { date: new Date(2012, 2, 24), value: 340 },
        { date: new Date(2012, 2, 25), value: 340 },
      ],
      color: 'brown',
      condition: '>',
    },
  ]

  // Add data to chart
  // Add X axis
  var x = d3
    .scaleTime()
    .domain(
      d3.extent(levelsManual[0].events, function (d) {
        return d.date
      })
    )
    .range([0, width])
  svg1
    .append('g')
    .attr('transform', 'translate(0,' + height + ')')
    .call(d3.axisBottom(x).ticks(5))

  svg2
    .append('g')
    .attr('transform', 'translate(0,' + height + ')')
    .call(d3.axisBottom(x).ticks(5))

  // Add Y axis with values
  var y = d3.scaleLinear().domain([yMin, yMax]).range([height, 0])
  svg1.append('g').call(d3.axisLeft(y))
  svg2.append('g').call(d3.axisLeft(y))

  // Add Y axis for levels
  const tickValues = thresholds.map(function (el) {
    // final level is never plotted, as the change at this last point is not visible
    return el.events[el.events.length - 2].value
  })
  this.warningAxis = d3
    .axisRight(y)
    .tickValues(tickValues)
    .tickFormat(function (d, i) {
      return thresholds[i].id
    })
  svg2
    .append('g')
    .attr('transform', 'translate(' + width + ' ,0)')
    .call(this.warningAxis)

  const areaGenManual = d3
    .area()
    .curve(d3.curveStepAfter)
    .x(function (d, i) {
      return x(d.date)
    })
    .y0(function (d, i) {
      return y(d.values[0])
    })
    .y1(function (d, i) {
      return y(d.values[1])
    })

  svg1
    .selectAll('p')
    .data(levelsManual)
    .enter()
    .append('path')
    .style('fill', function (d, i) {
      return d.color
    })
    .attr('d', function (d, i) {
      return areaGenManual(d.events)
    })

  function generateAreaGenerator(d, i) {
    const areaGen = d3
      .area()
      .curve(d3.curveStepAfter)
      .x(function (e, j) {
        return x(e.date)
      })
    if (d.condition === '<') {
      if (i === 0) {
        //set lower bound to bottom of chart
        areaGen.y0(function (e, j) {
          return y(y.domain()[0])
        })
      } else {
        // set lower bound to value of the threshold below this one
        areaGen.y0(function (e, j) {
          return y(thresholds[i - 1].events[j].value)
        })
      }
      // set upper bound to value of this threshold
      areaGen.y1(function (e, j) {
        return y(e.value)
      })
    } else if (d.condition === '>') {
      // set lower bound to value of this threshold
      areaGen.y0(function (e, j) {
        return y(e.value)
      })
      if (i === thresholds.length - 1) {
        // set upper bound to top of chart
        areaGen.y1(function (e, j) {
          return y(y.domain()[1])
        })
      } else {
        // set upper bound to value of threshold above this one
        areaGen.y1(function (e, j) {
          return y(thresholds[i + 1].events[j].value)
        })
      }
    }
    return areaGen
  }

  function generateLineGenerator(d, i) {
    console.log('generateLineGenerator: d:', d, 'i: ', i)
    const lineGen = d3
      .line()
      .curve(d3.curveStepAfter)
      .x((e, j) => {
        return x(e.date)
      })
      .y((e, j) => {
        return y(e.value)
      })
    return lineGen
  }

  svg2
    .selectAll('p')
    .data(thresholds)
    .enter()
    .append('path')
    .style('fill', function (d, i) {
      return d.color
    })
    .attr('d', function (d, i) {
      return generateAreaGenerator(d, i)(d.events)
    })

  svg2
    .selectAll('lines')
    .data(thresholds)
    .enter()
    .append('path')
    .attr('class', 'level-lines')
    .attr('d', (d, i) => {
      return generateLineGenerator(d, i)(d.events)
    })
}

window.addEventListener('load', onLoad)
