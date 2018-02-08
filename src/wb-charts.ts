import * as d3 from "d3"
import {scaleLinear} from "d3-scale"


export const CLOCKWISE = 1
export const ANTICLOCKWISE = -1

export interface data {
    x: number[]
    y: number[]
}

function mean(x : number[] | number )  { 
    
    if (x instanceof Array )  {
        return d3.mean(x)
    }
    return x
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
        let xAxis = d3.axisBottom(this.xScale)
        xAxis.ticks(8)
        let horizontalAxis = this.canvas.select(".x-axis").call(xAxis)
        let xticks = this.xScale.ticks(8).map(this.xScale) 
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

    radToDegrees(value: number) {
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
    colorMap: any
    id: string

    constructor(data: any, style: any) {
        this.data = data
        this.style = style
        // https://github.com/d3/d3-scale-chromatic
        this.colorMap = d3.scaleSequential(d3.interpolateWarm);
    }


    protected mapDataCartesian(axis: CartesianAxis, options: any) {

        let xkey = options.xkey ? options.xkey : 'x'
        let ykey = options.ykey ? options.ykey : 'y'

        axis.xScale.domain([0, 360])
        axis.yScale.domain([0, 1])

        let mappedData : any = this.data.map(
            function (d: any) {
                return {
                    x: axis.xScale(d[xkey]),
                    y: axis.yScale(d[ykey]),
                }
            }
        )
        return mappedData
    }

    protected mapDataPolar(axis: PolarAxis, options: any) {
        let tkey = options.tkey ? options.tkey : 't'
        let rkey = options.rkey ? options.rkey : 'r'

        let mappedData: any = this.data.map(
            function (d: any) {
                return {
                    r: axis.radialScale(d[rkey]),
                    t: axis.angularScale(d[tkey])
                }
            }
        )
        return mappedData
    }

    addTo(axis: Axis, options: any, id?: string) {       

        this.id = id ? id : ''
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


export class ChartMarker extends Chart {

    plotterCartesian(axis: CartesianAxis, options: any) {
        var canvas = axis.canvas
        let mappedData = this.mapDataCartesian(axis, options)

        this.group = canvas.append("g").attr("class", "chart-marker").attr("id",this.id)
        var elements = this.group.selectAll('.symbol')
            .data(mappedData)
            .enter()
            .append('path')
            .attr('transform', function (d: any, i: number) { return 'translate(' + d.x + ',' + d.y + ')'; })
            .attr('d', d3.symbol().type(function (d, i) { return d3.symbols[i % 7];}));
    }

    plotterPolar(axis: PolarAxis, options: any) {
        var canvas = axis.canvas;

        let mappedData = this.mapDataPolar(axis, options)

        this.group = canvas.append("g").attr("class", "chart-marker").attr("id",this.id)
        var elements = this.group.selectAll('.symbol')
            .data(mappedData)
            .enter()
            .append('path')
            .attr('transform', function (d: any, i: number) { return 'translate(' + d.r * Math.cos(d.t) + ',' + d.r * Math.sin(d.t) + ')'; })
            .attr('d', d3.symbol().type(function (d, i) { return d3.symbols[i % 7]; }) );

        elements.on('mouseover', function (d: any) { axis.showTooltip(d) })
        elements.on('mouseout', function (d: any) { axis.hideTooltip(d) })
    }

}

export class ChartLine extends Chart {

    plotterCartesian(axis: CartesianAxis, options: any) {
        var canvas = axis.canvas
        let mappedData = this.mapDataCartesian(axis, options)

        var line = d3.line()
            .x(function (d: any) { return d.x; })
            .y(function (d: any) { return d.y; })
            .defined(function (d: any) { return d.y != null })

        this.group = canvas.append("g").attr("class", "chart-line").attr("id", this.id)
        var elements = this.group.append('path')
            .attr('d', line(mappedData))
    }

    plotterPolar(axis: PolarAxis, options: any) {
        var canvas = axis.canvas;
        let mappedData = this.mapDataPolar(axis, options)
        var line = d3.lineRadial()
            .angle(function (d: any) { return d.t; })
            .radius(function (d: any) { return d.r; })
        this.group = canvas.append("g").attr("class", "chart-line").attr("id", this.id)
        var elements = this.group.append('path')
            .attr('d', line(mappedData))

        elements.on('mouseover', function (d: any) { axis.showTooltip(d) })
        elements.on('mouseout', function (d: any) { axis.hideTooltip(d) })
    }

}

export class ChartRange extends Chart {

    plotterCartesian(axis: CartesianAxis, options: any) {
        var canvas = axis.canvas
        let xkey = options.xkey ? options.xkey : 'x'
        let ykey = options.ykey ? options.ykey : 'y'
        let colorkey = options.colorkey ? options.colorkey : ykey

        axis.xScale.domain([0, 360])
        axis.yScale.domain([0, 1])

        var colorScale = d3.scaleLinear().domain([0, 4])
        var colorMap = this.colorMap

        console.log()
        let mappedData: any = this.data.map(
            function (d: any) {
                return {
                    x: d[xkey].map(axis.xScale),
                    y: d[ykey].map(axis.yScale),
                    color: colorMap(colorScale(mean(d[colorkey])) )
                }
            }
        )
        console.log(mappedData)

        this.group = canvas.append("g").attr("class", "chart-range").attr("id",this.id)
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
        
        let tkey = options.tkey ? options.tkey : 't'
        let rkey = options.rkey ? options.rkey : 'r'
        let colorkey = options.colorkey ? options.colorkey : rkey

        var colorScale = d3.scaleLinear().domain([0, 4])
        var colorMap = this.colorMap

        console.log(this.data)
        console.log(options)
        let mappedData: any = this.data.map(
            function (d: any) {
                return {
                    r: d[rkey].map(axis.radialScale),
                    t: d[tkey].map(axis.angularScale),
                    color: colorMap(colorScale(mean(d[colorkey])))
                }
            }
        )

        var arcgenerator = d3.arc()
            .innerRadius(function (d: any, i) { return d.r[0] })
            .outerRadius(function (d: any, i) { return d.r[1] })
            .startAngle(function (d: any, i) { return d.t[0] })
            .endAngle(function (d: any, i) { return d.t[1] })

        this.group = canvas.append("g").attr("class", "chart-range").attr("id", this.id)
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
