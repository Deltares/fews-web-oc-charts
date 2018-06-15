import * as d3 from "d3"
import * as wb from "./wb-charts"

function randomSpectrum(a:number) {
    let spectrum= []
    for (var i = 0; i < 50; i++) {
        spectrum.push({ x: 50 + i * 100, y: a*d3.randomUniform()() })
    }
    return spectrum;
}


// set constants
let height = 400
let width = 400
let container1 = document.getElementById("chart-container-1")

console.log(container1)

let polaraxis = new wb.PolarAxis(container1, width, height,
    {direction: wb.CLOCKWISE, innerRadius: 40, angularRange: [0, 2* Math.PI], radialScale: wb.AUTO_SCALE } )

let polarData = [
    [
        { x: [1, 2], y: [35, 85], v: 0 },
        { x: [2, 3], y: [30, 75], v: 0.5 },
        { x: [3, 4], y: [40, 65], v: 1 },
        { x: [4, 5], y: [50, 95], v: 2 },
        { x: [5, 6], y: [45, 90], v: 0.5 },
        { x: [6, 7], y: [-10, 15], v: 0 }
    ], 
    [
        { x: [.1, .2], y: [15, 75], v: 0 },
        { x: [.2, .3], y: [10, 85], v: 1.5 },
        { x: [.3, .4], y: [10, 85], v: 1.5 },
        { x: [.4, .5], y: [10, 85], v: 0 },
        { x: [.5, .6], y: [15, 80], v: 0.5 },
    ]
]

let plot = new wb.ChartRange( polarData[0], {})


var random = []
for (var i = 0; i < 100; i++) {
    random.push({ x: d3.randomUniform(0, 1)(), y: d3.randomUniform(0, 360)() }  )
}

let a = 0
let b =  1 / 1440
var archimedeanSpiral = []
for (var i = 0; i <= 1440; i+= 5) {
    archimedeanSpiral.push({ x: a + b * i, y: i % 360 })
}

let plot2 = new wb.ChartMarker(random, {})
let plot3 = new wb.ChartLine(archimedeanSpiral, {})

var spectra = randomSpectrum(1)

let plot4 = new wb.ChartHistogram( spectra, {colorScale: wb.AUTO_SCALE})
let plot5 = new wb.ChartLine(spectra, {})


plot.addTo(polaraxis, { rkey: "x", tkey: "y", colorkey: 'v' })
// plot2.addTo(polaraxis, { rkey: "x", tkey: "y" }, 'polar-dot')
// plot3.addTo(polaraxis, { rkey: "x", tkey: "y" }, 'polar-line')

let container2 = document.getElementById("chart-container-2")
let axis = new wb.CartesianAxis(container2, 400, height, {yScale: wb.AUTO_SCALE} )
// plot.addTo(axis, {xkey : "y", ykey: "x", colorkey: 'v' })
// plot2.addTo(axis, { xkey: "y", ykey: "x"}, 'cartesian-dot')
// plot3.addTo(axis, { xkey: "y", ykey: "x" }, 'cartesian-line')
plot4.addTo(axis, { xkey: "x", ykey: "y", colorkey: "y"},'cartesian-histogram' )
// plot5.addTo(axis, { xkey: "x", ykey: "y", colorkey: "y" }, 'cartesian-line')


var count=0
let updateCharts=function(event: Event) {
    var newdata = randomSpectrum(count+1);
    plot4.data = newdata;
    axis.redraw();
    count++
    plot.data = polarData[count % 2]
    polaraxis.redraw();
}

let input = document.getElementById("slider")
input.onchange = function(event: Event) { updateCharts(event) }

