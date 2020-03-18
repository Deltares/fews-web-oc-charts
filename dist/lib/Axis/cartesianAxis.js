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
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
var d3 = require("d3");
var axis_1 = require("./axis");
var moment_timezone_1 = require("moment-timezone");
// import { scaleLinear } from 'd3-scale'
function mean(x) {
    if (x instanceof Array) {
        return d3.mean(x);
    }
    return x;
}
var CartesianAxis = /** @class */ (function (_super) {
    __extends(CartesianAxis, _super);
    function CartesianAxis(container, width, height, options) {
        var _this = _super.call(this, container, width, height, options) || this;
        _this.view = _this.canvas;
        _this.chartGroup = _this.canvas;
        _this.setCanvas();
        _this.setRange();
        _this.initGrid();
        _this.setClipPath();
        _this.chartGroup = _this.chartGroup
            .append('g')
            .attr('class', 'group')
            .attr('clip-path', 'url(#' + _this.clipPathId + ')')
            .append('g');
        return _this;
    }
    CartesianAxis.prototype.setCanvas = function () {
        var rect = this.canvas.select('.axis-canvas');
        if (rect.size() === 0) {
            this.clipPathId =
                'id-' +
                    Math.random()
                        .toString(36)
                        .substr(2, 16);
            this.canvas
                .append('g')
                .attr('class', 'axis-canvas')
                .attr('clip-path', 'url(#' + this.clipPathId + ')')
                .append('rect')
                .attr('width', this.width)
                .attr('height', this.height);
        }
        else {
            rect
                .select('rect')
                .attr('height', this.height)
                .attr('width', this.width);
        }
    };
    CartesianAxis.prototype.setClipPath = function () {
        var clipPath = this.defs.select('#' + this.clipPathId);
        if (clipPath.size() === 0) {
            this.defs
                .append('clipPath')
                .attr('id', this.clipPathId)
                .append('rect')
                .attr('height', this.height)
                .attr('width', this.width);
        }
        else {
            clipPath
                .select('rect')
                .attr('height', this.height)
                .attr('width', this.width);
        }
    };
    CartesianAxis.prototype.zoom = function () {
        for (var _i = 0, _a = this.charts; _i < _a.length; _i++) {
            var chart = _a[_i];
            chart.plotter(this, chart.dataKeys);
        }
        this.updateGrid();
        // FIXME: move to Axis.ts?
        for (var _b = 0, _c = this.visitors; _b < _c.length; _b++) {
            var visitor = _c[_b];
            visitor.redraw();
        }
    };
    CartesianAxis.prototype.redraw = function (options) {
        options = __assign({ x: { autoScale: false }, y: { autoScale: false } }, options);
        if (this.options.x && this.options.x.domain) {
            this.xScale.domain(this.options.x.domain);
        }
        else if (options.x.autoScale === true) {
            var xExtent = new Array(2);
            for (var _i = 0, _a = this.charts; _i < _a.length; _i++) {
                var chart = _a[_i];
                var chartXExtent = chart.extent[chart.dataKeys.xkey];
                xExtent = d3.extent(d3.merge([xExtent, [].concat.apply([], chartXExtent)]));
            }
            this.xScale.domain(xExtent);
        }
        if (this.options.y && this.options.y.domain) {
            this.yScale.domain(this.options.y.domain);
        }
        else if (options.y.autoScale === true) {
            var yExtent = new Array(2);
            for (var _b = 0, _c = this.charts; _b < _c.length; _b++) {
                var chart = _c[_b];
                var chartYExtent = chart.extent[chart.dataKeys.ykey];
                yExtent = d3.extent(d3.merge([yExtent, [].concat.apply([], chartYExtent)]));
            }
            this.yScale.domain(yExtent);
        }
        for (var _d = 0, _e = this.charts; _d < _e.length; _d++) {
            var chart = _e[_d];
            chart.plotter(this, chart.dataKeys);
        }
        this.updateGrid();
    };
    CartesianAxis.prototype.resize = function () {
        this.setSize();
        this.setRange();
        this.zoom();
    };
    CartesianAxis.prototype.updateGrid = function () {
        this.setClipPath();
        this.setCanvas();
        var that = this;
        var xAxis = d3.axisBottom(this.xScale).ticks(5);
        var xGrid = d3
            .axisBottom(this.xScale)
            .ticks(5)
            .tickSize(this.height);
        if (this.options.x && this.options.x.time) {
            xAxis.tickFormat(this.generateMultiFormat());
            var offsetDomain = this.xScale.domain().map(function (d) {
                var m = moment_timezone_1.default(d).tz(that.timeZone);
                return new Date(d.getTime() + m.utcOffset() * 60000);
            });
            var offsetScale = d3.scaleUtc().domain(offsetDomain);
            var tickValues = offsetScale.ticks(5);
            var offsetValues = tickValues.map(function (d) {
                var m = moment_timezone_1.default(d).tz(that.timeZone);
                return new Date(d.getTime() - m.utcOffset() * 60000);
            });
            xAxis.tickValues(offsetValues);
            xGrid.tickValues(offsetValues);
        }
        var yAxis = d3.axisLeft(this.yScale).ticks(5);
        var yGrid = d3
            .axisRight(this.yScale)
            .ticks(5)
            .tickSize(this.width);
        if (this.options.y && this.options.y.axisType === 'degrees') {
            var domain = this.yScale.domain();
            var step = d3.tickIncrement(domain[0], domain[1], 5);
            step = step >= 100 ? 90 : step >= 50 ? 45 : step >= 20 ? 15 : step;
            var start = Math.ceil(domain[0] / step) * step;
            var stop_1 = Math.floor(domain[1] / step + 1) * step;
            yAxis.tickValues(d3.range(start, stop_1, step));
            yGrid.tickValues(d3.range(start, stop_1, step));
        }
        if (this.options.transitionTime > 0 && !this.initialDraw) {
            var t = d3
                .transition()
                .duration(this.options.transitionTime)
                .ease(d3.easeLinear);
            this.canvas
                .select('.x-axis')
                .attr('transform', 'translate(' + 0 + ',' + this.height + ')')
                .transition(t)
                .call(xAxis);
            this.canvas
                .select('.x-grid')
                .transition(t)
                .call(xGrid);
            this.canvas
                .select('.y-axis')
                .transition(t)
                .call(yAxis);
            this.canvas
                .select('.y-grid')
                .transition(t)
                .call(yGrid);
        }
        else {
            this.canvas
                .select('.x-axis')
                .attr('transform', 'translate(' + 0 + ',' + this.height + ')')
                .call(xAxis);
            this.canvas.select('.x-grid').call(xGrid);
            this.canvas.select('.y-axis').call(yAxis);
            this.canvas.select('.y-grid').call(yGrid);
        }
        this.initialDraw = false;
    };
    CartesianAxis.prototype.showTooltip = function (html) {
        this.tooltip
            .transition()
            .duration(50)
            .style('opacity', 0.9);
        this.tooltip
            .html(html)
            .style('left', d3.event.pageX + 'px')
            .style('top', d3.event.pageY + 'px');
    };
    CartesianAxis.prototype.setRange = function () {
        if (!this.xScale) {
            this.xScale = this.options.x && this.options.x.time ? d3.scaleUtc() : d3.scaleLinear();
        }
        if (!this.yScale)
            this.yScale = d3.scaleLinear();
        this.xScale.range([0, this.width]);
        this.yScale.range([this.height, 0]);
    };
    CartesianAxis.prototype.initGrid = function () {
        var g = this.canvas;
        var yGrid = g.append('g').attr('class', 'grid y-grid');
        var xGrid = g.append('g').attr('class', 'grid x-grid');
        var horizontalAxis = g
            .append('g')
            .attr('class', 'axis x-axis')
            .attr('transform', 'translate(' + 0 + ',' + this.height + ')');
        var yAxis = g.append('g').attr('class', 'axis y-axis');
        if (this.options.y) {
            if (this.options.y.label) {
                g.append('text')
                    .attr('x', 0)
                    .attr('y', -9)
                    .attr('text-anchor', 'start')
                    .attr('font-family', 'sans-serif')
                    .attr('font-size', '10px')
                    .text(this.options.y.label);
            }
            if (this.options.y.unit) {
                g.append('text')
                    .attr('x', -9)
                    .attr('y', -9)
                    .attr('text-anchor', 'end')
                    .attr('font-family', 'sans-serif')
                    .attr('font-size', '10px')
                    .text(this.options.y.unit);
            }
        }
        if (this.options.x) {
            if (this.options.x.label) {
                g.append('text')
                    .attr('x', this.width / 2)
                    .attr('y', this.height + 30)
                    .attr('text-anchor', 'middle')
                    .attr('font-family', 'sans-serif')
                    .attr('font-size', '10px')
                    .text(this.options.x.label);
            }
            if (this.options.x.unit) {
                g.append('text')
                    .attr('x', this.width + 10)
                    .attr('y', this.height + 9)
                    .attr('dy', '0.71em')
                    .attr('text-anchor', 'start')
                    .attr('font-family', 'sans-serif')
                    .attr('font-size', '10px')
                    .text(this.options.x.unit);
            }
        }
        if (this.options.x2) {
            if (this.options.x2.unit) {
                g.append('text')
                    .attr('x', this.width + 10)
                    .attr('y', -9)
                    .attr('text-anchor', 'start')
                    .attr('font-family', 'sans-serif')
                    .attr('font-size', '10px')
                    .text(this.options.x2.unit);
            }
        }
    };
    CartesianAxis.prototype.generateMultiFormat = function () {
        var timeZone = this.timeZone;
        return function (date) {
            var m = moment_timezone_1.default(date).tz(timeZone);
            var offsetDate = new Date(date.getTime() + m.utcOffset() * 60000);
            return (d3.utcSecond(offsetDate) < offsetDate
                ? m.format('.SSS')
                : d3.utcMinute(offsetDate) < offsetDate
                    ? m.format(':ss')
                    : d3.utcHour(offsetDate) < offsetDate
                        ? m.format('hh:mm')
                        : d3.utcDay(offsetDate) < offsetDate
                            ? m.format('hh:mm')
                            : d3.utcMonth(offsetDate) < offsetDate
                                ? d3.utcWeek(offsetDate) < offsetDate
                                    ? m.format('dd DD')
                                    : m.format('MMM DD')
                                : d3.utcYear(offsetDate) < offsetDate
                                    ? m.format('MMMM')
                                    : m.format('YYYY'));
        };
    };
    return CartesianAxis;
}(axis_1.Axis));
exports.CartesianAxis = CartesianAxis;
//# sourceMappingURL=cartesianAxis.js.map