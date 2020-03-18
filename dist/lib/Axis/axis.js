"use strict";
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
var Axis = /** @class */ (function () {
    function Axis(container, width, height, options) {
        this.tooltip = null;
        this.initialDraw = true;
        this.container = container;
        this.options = options;
        this.timeZone = 'Europe/Amsterdam';
        this.margin = __assign({ top: 40, right: 40, bottom: 40, left: 40 }, options.margin);
        this.setSize(height, width);
        this.svg = d3
            .select(container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('class', 'wb-charts')
            .attr('overflow', 'visible');
        this.defs = this.svg.append('defs');
        this.canvas = this.svg
            .append('g')
            .attr('transform', 'translate(' + this.margin.left + ',' + this.margin.top + ')');
        this.createTooltip();
        this.charts = [];
        this.visitors = [];
    }
    Axis.prototype.setSize = function (height, width) {
        // FIXME: does not work for arguments
        var containerWidth = width == null ? this.container.offsetWidth : width;
        var containerHeight = height == null ? this.container.offsetHeight : height;
        this.height = containerHeight - this.margin.top - this.margin.bottom;
        this.width = containerWidth - this.margin.left - this.margin.right;
        if (this.height < 0 || this.width < 0) {
            this.height = 0;
            this.width = 0;
        }
    };
    Axis.prototype.resize = function () {
        this.setSize();
        this.setRange();
        this.updateGrid();
        this.redraw();
    };
    Axis.prototype.removeAllCharts = function () {
        for (var i = 0; i < this.charts.length; i++) {
            // console.log(this.charts[i].id)
            this.charts[i].group = null;
        }
        this.charts = [];
        this.chartGroup.selectAll('g').remove();
    };
    Axis.prototype.accept = function (v) {
        this.visitors.push(v);
        v.visit(this);
    };
    Axis.prototype.createChartGroup = function () {
        this.chartGroup = this.canvas.append('g').attr('class', 'charts');
    };
    Axis.prototype.createTooltip = function () {
        this.tooltip = d3
            .select(this.container)
            .append('div')
            .attr('class', 'tooltip')
            .style('opacity', 0);
    };
    Axis.prototype.hideTooltip = function (d) {
        this.tooltip
            .transition()
            .duration(50)
            .style('opacity', 0);
    };
    return Axis;
}());
exports.Axis = Axis;
//# sourceMappingURL=axis.js.map