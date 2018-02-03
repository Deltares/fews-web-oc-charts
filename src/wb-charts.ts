import * as d3 from "d3"
import {scaleLinear} from "d3-scale"


export const CLOCKWISE = 1
export const ANTICLOCKWISE = -1

export interface data {
    x: number[]
    y: number[]
}

function mean(x : number[])  { 
    var sum: number = 0
    for (var i = 0; i < x.length; i++) {
        sum += x[i]
    }
    return sum/ x.length
}

export interface axisOptions {
    direction?: number
    angularRange?: number[]
    innerRadius?: number
}


export abstract class Axis {
    type: string
    canvas: any
    container: HTMLElement
    width: number
    height: number
    margin: any
    tooltip: any;
    options: any


    constructor(container: HTMLElement, width: number, height: number, options: axisOptions) {
        this.container = container
        this.options = options
        let margin = this.margin = { 
            top: 40,
            right: 40,
            bottom: 40,
            left: 40
        }
        this.height = height - margin.top- margin.bottom
        this.width = width - margin.left - margin.right
        this.canvas = d3.select(container).append("svg")
            .attr("width", width)
            .attr("height", height)
            .append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
        this.createTooltip()

    }

    protected setScale() {}
    protected initGrid() {}
    updateGrid() {}

    createTooltip() {
        this.tooltip = this.canvas.append('div')                 
            .attr('class', 'tooltip')     

        this.tooltip.append('div')            
            .attr('class', 'label')       

        this.tooltip.append('div')            
            .attr('class', 'value')       
    }

    showTooltip(d: any) {
        this.tooltip.select('.label').html("test");
        this.tooltip.style('display', 'block');
    }

    hideTooltip(d: any) {
        this.tooltip.style('display', 'hide');
    }

}

export class CartesianAxis extends Axis {

    canvas: any
    container: HTMLElement
    xScale: any
    yScale: any

    constructor(container: HTMLElement, width: number, height: number, options?:axisOptions) {
        super(container, width, height, options);
        this.canvas.append("g")
            .attr("class", "axis-canvas")
            .append("rect")
                .attr("width",this.width)
                .attr("height",this.height)

        this.setScale()
        this.initGrid()
    }

    protected setScale(){
        this.xScale = d3.scaleLinear().range([0, this.width])
        this.yScale = d3.scaleLinear().range([this.height, 0])
    }

    protected initGrid() {
        var g = this.canvas
        let yGrid = g.append("g")
            .attr("class", "y-grid")
        let xGrid = g.append("g")
            .attr("class", "x-grid")
        let horizontalAxis = g.append("g")
            .attr("class", "x-axis")
            .attr("transform", "translate(" + 0 + "," + this.height + ")")
        let yAxis = g.append("g")
            .attr("class", "y-axis")
        this.updateGrid()
    }

    updateGrid() {

        var g = this.canvas
        let xAxis = d3.axisBottom(this.xScale).ticks(5)
        let horizontalAxis = this.canvas.select(".x-axis").call(xAxis)
        let xticks = this.xScale.ticks(5).map(this.xScale); 
        let xGrid = this.canvas.select(".x-grid").selectAll("line")
            .data(xticks)
            .enter()
            .append("line")
            .attr("x1",function(d: number) {return d } )
            .attr("y1",this.height)
            .attr("x2",function (d: number) { return d })
            .attr("y2",0)

        let yAxis = d3.axisLeft(this.yScale).ticks(5)
        let verticalAxis = this.canvas.select(".y-axis").call(yAxis)
        let yticks = this.yScale.ticks(5).map(this.yScale); 

        let yGrid = this.canvas.select(".y-grid").selectAll("line")
            .data(yticks)
            .enter()
            .append("line")
            .attr("x1", 0)
            .attr("y1", function (d: number) { return d })
            .attr("x2", this.width)
            .attr("y2", function (d: number) { return d })
    }
}



export class PolarAxis extends Axis {

    radialScale: any
    angularScale: any
    direction: number
    outerRadius: number
    innerRadius: number
    angularRange: number[]

    constructor(container: HTMLElement, width: number, height: number, options?: axisOptions) { 
        super(container , width, height, options );
        this.canvas = this.canvas.
            append("g")
            .attr("transform", "translate(" + this.width / 2 + "," + this.height / 2 + " )")

            
        this.direction = options.direction ? options.direction : ANTICLOCKWISE
        this.innerRadius = options.innerRadius ? options.innerRadius : 0
        this.outerRadius = Math.min(this.width, this.height) / 2
        if ( options.angularRange ) {
            this.angularRange = [options.angularRange[0] , options.angularRange[1] ]
        } else {
            this.angularRange = [0, 2 * Math.PI]
        }
        
        this.canvas.append("g")
            .attr("class", "axis-canvas")
            .append("path")
            .attr("d", d3.arc().
                innerRadius(this.innerRadius)
                .outerRadius(this.outerRadius)
                .startAngle(this.angularRange[0])
                .endAngle(this.angularRange[1])
            )

        this.setScale()
        this.initGrid()     
    }

    protected setScale(){
        this.radialScale = d3.scaleLinear().domain([0, 1]).range([this.innerRadius, this.outerRadius])
        this.angularScale = d3.scaleLinear().domain([0, 360]).range(this.angularRange)
    }

    protected initGrid() {

        let radialGrid= this.canvas.append("g")
            .attr("class", "r-grid")
        let angularGrid = this.canvas.append("g")
            .attr("class", "t-grid")
        let radialAxis = this.canvas.append("g")
            .attr("class", "r-axis")
        let angularAxis = this.canvas.append("g")
            .attr("class", "t-axis")
        this.updateGrid()
    }

    private radToDegrees(value: number) {
        return value * 180 / Math.PI
    }

    updateGrid() {

        // draw the circular grid lines
        var g = this.canvas
        //draw the radial axis
        let rAxis = d3.axisBottom(this.radialScale).ticks(5)
        
        let radialAxis = this.canvas.select(".r-axis")
            .call(rAxis)

        let radialTicks = this.radialScale.ticks(5).map(this.radialScale)
        var drawRadial = this.canvas.select(".r-grid").selectAll("circle")
            .data(radialTicks)
            .enter()
                .append("circle")
                .attr("cx", 0 )
                .attr("cy", 0)
                .attr("r", function (d: number ) { return d} )

        let angularTicks = d3.range(this.angularRange[0], this.angularRange[1], this.angularRange[1] / 8 )
        var suffix: string = "";
        let offset = 10

        angularTicks = angularTicks.map(this.radToDegrees)

        var drawAngular = this.canvas.select(".t-grid").selectAll("line")
            .data(angularTicks)
            .enter()
            .append("line")
            .attr("x1", radialTicks[0])
            .attr("y1", 0)
            .attr("x2", this.outerRadius)
            .attr("y2", 0)
            .attr("transform", function (d: number) { return "rotate("+d + ")" } )
    }

}

export const RANGE = 13

export abstract class Chart {
 
    data: any
    style: any
    group: any
    colorScale: any

    constructor(data: any, style: any) {
        this.data = data
        this.style =style
        this.colorScale = d3.scaleSequential(d3.interpolateWarm);
    }  

    addTo(axis: Axis, options: any) {       

        if (axis instanceof CartesianAxis) {
            this.plotterCartesian(axis, options)
        } else if (axis instanceof PolarAxis) {
            this.plotterPolar(axis, options)
        }
        axis.updateGrid();
        return this
    }

    plotterCartesian(axis: Axis, options: any) {}
    plotterPolar(axis: Axis, options: any) { }

}

export class ChartRange extends Chart {



    plotterCartesian(axis: CartesianAxis, options: any) {
        var canvas = axis.canvas
        var colorScale = this.colorScale
        let xkey = options.xkey ? options.xkey : 'x'
        let ykey = options.ykey ? options.ykey : 'y'

        axis.xScale.domain([0, 360])
        axis.yScale.domain([0, 1])

        let mappedData: any = this.data.map(
            function (d: any) {
                return {
                    x: d[xkey].map(axis.xScale),
                    y: d[ykey].map(axis.yScale),
                    color: colorScale(mean(d[ykey]))
                }
            }
        )

        this.group = canvas.append("g").attr("class", "plot-1")
        var elements = this.group.selectAll("rect")
            .data(mappedData)
            .enter()
            .append("rect")
            .attr("x", function (d: any) { return d.x[0] })
            .attr("y", function (d: any) { return d.y[1] })
            .attr("width", function (d: any) { return d.x[1] - d.x[0] })
            .attr("height", function (d: any) { return d.y[0] - d.y[1] })
            .style("fill", function (d: any) { return d.color })
    }

    plotterPolar(axis: PolarAxis, options: any) {
        var canvas = axis.canvas;
        var colorScale = this.colorScale
        
        let mappedData: any = this.data.map(
            function (d: any) {
                return {
                    x: d.x.map(axis.radialScale),
                    y: d.y.map(axis.angularScale),
                    color: colorScale(mean(d.x))
                }
            }
        )

        var arcgenerator = d3.arc()
            .innerRadius(function (d: any, i) { return d.x[0] })
            .outerRadius(function (d: any, i) { return d.x[1] })
            .startAngle(function (d: any, i) { return d.y[0] })
            .endAngle(function (d: any, i) { return d.y[1] })

        this.group = canvas.append("g").attr("class", "plot-1")
        var elements = this.group.selectAll("path")
            .data(mappedData)
            .enter()
            .append("path")
            .style("fill", function (d: any) { return d.color })
            .attr("d", arcgenerator)

        elements.on('mouseover', function (d: any) { axis.showTooltip(d) })
        elements.on('mouseout', function (d: any) { axis.hideTooltip(d) })
    }



}
