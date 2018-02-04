import * as d3 from "d3"
import * as wb from "./wb-charts"

// set constants
let height = 400
let width = 400
let container1 = document.getElementById("chart-container-1")

let polaraxis = new wb.PolarAxis(container1, width, height, 
    {direction: wb.CLOCKWISE, innerRadius: 10, angularRange: [0, 2* Math.PI]} )
let plot = new wb.ChartRange( [
    { x: [.1, .2], y: [35, 85] , v: 0},
    { x: [.2, .3], y: [30, 75], v: 0.5 },
    { x: [.3, .4], y: [40, 65], v: 1 },
    { x: [.4, .5], y: [50, 95], v: 2 },
    { x: [.5, .6], y: [45, 90], v: 0.5},
    { x: [.6, .7], y: [40, 95], v: 0 }
], {}).addTo(polaraxis, { rkey: "x", tkey: "y", colorkey: 'v' })

let container2 = document.getElementById("chart-container-2")
let axis = new wb.CartesianAxis(container2, 800, height )
plot.addTo(axis, {xkey : "y", ykey: "x", colorkey: 'v' });