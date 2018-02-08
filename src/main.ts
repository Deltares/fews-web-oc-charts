import * as d3 from "d3"
import * as wb from "./wb-charts"

function randomFromInterval(min: number, max: number) {
    return (Math.random() * (max - min ) + min);
}

// set constants
let height = 400
let width = 400
let container1 = document.getElementById("chart-container-1")

let polaraxis = new wb.PolarAxis(container1, width, height, 
    {direction: wb.CLOCKWISE, innerRadius: 40, angularRange: [0, 2* Math.PI]} )
let plot = new wb.ChartRange( [
    { x: [.1, .2], y: [35, 85] , v: 0},
    { x: [.2, .3], y: [30, 75], v: 0.5 },
    { x: [.3, .4], y: [40, 65], v: 1 },
    { x: [.4, .5], y: [50, 95], v: 2 },
    { x: [.5, .6], y: [45, 90], v: 0.5},
    { x: [.6, .7], y: [40, 95], v: 0 }
], {})


var random = []
for (var i = 0; i < 100; i++) {
    random.push({ x: randomFromInterval(0, 1), y: randomFromInterval(0, 360) }  )
}

let a = 0
let b =  1 / 1440 
var archimedeanSpiral = []
for (var i = 0; i <= 1440; i+= 5) {
    archimedeanSpiral.push({ x: a + b * i, y: i % 360 })
}

console.log(random)
let plot2 = new wb.ChartMarker(random, {})
let plot3 = new wb.ChartLine(archimedeanSpiral, {})

plot.addTo(polaraxis, { rkey: "x", tkey: "y", colorkey: 'v' })
// plot2.addTo(polaraxis, { rkey: "x", tkey: "y" }, 'polar-dot')
plot3.addTo(polaraxis, { rkey: "x", tkey: "y" }, 'polar-line')

let container2 = document.getElementById("chart-container-2")
let axis = new wb.CartesianAxis(container2, 400, height )
// plot.addTo(axis, {xkey : "y", ykey: "x", colorkey: 'v' })
// plot2.addTo(axis, { xkey: "y", ykey: "x"}, 'cartesian-dot')
plot3.addTo(axis, { xkey: "y", ykey: "x" }, 'cartesian-line')