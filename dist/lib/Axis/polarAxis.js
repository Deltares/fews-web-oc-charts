"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var d3 = require("d3");
var axis_1 = require("./axis");
// import { scaleLinear } from 'd3-scale'
exports.CLOCKWISE = -1;
exports.ANTICLOCKWISE = 1;
function mean(x) {
    if (x instanceof Array) {
        return d3.mean(x);
    }
    return x;
}
var PolarAxis = /** @class */ (function (_super) {
    __extends(PolarAxis, _super);
    function PolarAxis(container, width, height, options) {
        var _this = _super.call(this, container, width, height, options) || this;
        _this.canvas = _this.canvas
            .append('g')
            .attr('transform', 'translate(' + _this.width / 2 + ',' + _this.height / 2 + ' )');
        _this.direction =
            options.angular && options.angular.direction ? options.angular.direction : exports.ANTICLOCKWISE;
        _this.intercept = options.angular && options.angular.intercept ? options.angular.intercept : 0;
        _this.innerRadius = options.innerRadius ? options.innerRadius : 0;
        _this.outerRadius = Math.min(_this.width, _this.height) / 2;
        _this.angularRange =
            options.angular && options.angular.range ? options.angular.range : [0, 2 * Math.PI];
        _this.canvas
            .append('g')
            .attr('class', 'axis-canvas')
            .append('path')
            .attr('d', d3
            .arc()
            .innerRadius(_this.innerRadius)
            .outerRadius(_this.outerRadius)
            .startAngle(_this.angularRange[0])
            .endAngle(_this.angularRange[1]));
        _this.setRange();
        _this.initGrid();
        _this.createChartGroup();
        return _this;
    }
    PolarAxis.prototype.redraw = function () {
        var radialExtent = new Array(2);
        for (var _i = 0, _a = this.charts; _i < _a.length; _i++) {
            var chart = _a[_i];
            var chartRadialExtent = chart.extent[chart.dataKeys.rkey];
            radialExtent = d3.extent(d3.merge([radialExtent, [].concat.apply([], chartRadialExtent)]));
        }
        this.radialScale.domain(radialExtent);
        for (var _b = 0, _c = this.charts; _b < _c.length; _b++) {
            var chart = _c[_b];
            chart.plotter(this, chart.dataKeys);
        }
        this.updateGrid();
    };
    PolarAxis.prototype.radToDegrees = function (value) {
        return (value * 180) / Math.PI;
    };
    PolarAxis.prototype.updateGrid = function () {
        // draw the circular grid lines
        var g = this.canvas;
        // draw the radial axis
        var rAxis = d3.axisBottom(this.radialScale).ticks(5);
        var radialAxis = this.canvas.select('.r-axis').call(rAxis);
        var radialTicks = this.radialScale.ticks(5).map(this.radialScale);
        var drawRadial = this.canvas
            .select('.r-grid')
            .selectAll('circle')
            .data(radialTicks);
        drawRadial.exit().remove();
        drawRadial
            .enter()
            .append('circle')
            .merge(drawRadial)
            .attr('cx', 0)
            .attr('cy', 0)
            .attr('r', function (d) {
            return d;
        });
        var angularTicks = d3.range(this.angularRange[0], this.angularRange[1], this.angularRange[1] / 8);
        var suffix = '';
        var offset = 10;
        angularTicks = angularTicks.map(this.radToDegrees);
        var drawAngular = this.canvas
            .select('.t-grid')
            .selectAll('line')
            .data(angularTicks)
            .enter()
            .append('line')
            .attr('x1', radialTicks[0])
            .attr('y1', 0)
            .attr('x2', this.outerRadius)
            .attr('y2', 0)
            .attr('transform', function (d) {
            return 'rotate(' + d + ')';
        });
        var groupRotate = function (d) {
            return 'rotate(' + -this.direction * d + ')';
        }.bind(this);
        var drawTicks = this.canvas
            .select('.t-axis')
            .selectAll('g')
            .data(angularTicks)
            .enter()
            .append('g')
            .attr('class', 'tick')
            .attr('transform', groupRotate);
        //   .attr('opacity',1)
        drawTicks
            .append('line')
            .attr('x1', this.outerRadius)
            .attr('y1', 0)
            .attr('x2', this.outerRadius + 6)
            .attr('y2', 0);
        var textRotate = function (d) {
            return ('rotate(' +
                (this.direction * d + this.intercept) +
                ',' +
                (this.outerRadius + 15) +
                ',0' +
                ')');
        }.bind(this);
        var anchor = function (d) {
            var dNorthCW = (((90 - this.intercept - this.direction * d) % 360) + 360) % 360;
            if (dNorthCW > 0 && dNorthCW < 180) {
                return 'start';
            }
            else if (dNorthCW > 180 && dNorthCW < 360) {
                return 'end';
            }
            else {
                return 'middle';
            }
        }.bind(this);
        drawTicks
            .append('text')
            .attr('text-anchor', anchor)
            .attr('alignment-baseline', 'middle')
            .attr('x', this.outerRadius + 15)
            .attr('y', 0)
            .text(function (d) {
            return d + '°';
        })
            .attr('transform', textRotate);
    };
    PolarAxis.prototype.showTooltip = function (html) {
        this.tooltip
            .transition()
            .duration(50)
            .style('opacity', 0.9);
        this.tooltip
            .html(html)
            .style('left', d3.event.pageX + 'px')
            .style('top', d3.event.pageY + 'px');
    };
    PolarAxis.prototype.setRange = function () {
        this.radialScale = d3.scaleLinear().range([this.innerRadius, this.outerRadius]);
        this.angularScale = d3
            .scaleLinear()
            .domain([0, 360])
            .range(this.angularRange);
    };
    PolarAxis.prototype.initGrid = function () {
        var radialGrid = this.canvas.append('g').attr('class', 'grid r-grid');
        var angularGrid = this.canvas.append('g').attr('class', 'grid t-grid');
        var radialAxis = this.canvas.append('g').attr('class', 'axis r-axis');
        var angularAxis = this.canvas
            .append('g')
            .attr('class', 'axis t-axis')
            .attr('font-size', '10')
            .attr('font-family', 'sans-serif')
            .attr('transform', 'rotate(' + -this.intercept + ')');
        this.updateGrid();
    };
    return PolarAxis;
}(axis_1.Axis));
exports.PolarAxis = PolarAxis;
//# sourceMappingURL=polarAxis.js.map