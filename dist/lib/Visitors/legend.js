"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var d3 = require("d3");
var Charts_1 = require("../Charts");
var Legend = /** @class */ (function () {
    function Legend(labels, container) {
        this.container = container;
        this.labels = labels;
        this.svg = d3
            .select(container)
            .append('svg')
            .attr('class', 'legend');
        this.group = this.svg.append('g');
    }
    Legend.prototype.visit = function (axis) {
        this.axis = axis;
        this.redraw();
    };
    Legend.prototype.redraw = function () {
        this.svg
            .attr('width', this.axis.margin.left + this.axis.width + this.axis.margin.right)
            .attr('height', 100);
        this.group.attr('transform', 'translate(' + this.axis.margin.left + ', 0)');
        this.group.selectAll('g').remove();
        var entries = this.group.selectAll('g').data(this.labels);
        var that = this;
        var maxWidth = 0;
        var enter = entries
            .enter()
            .append('g')
            .attr('class', 'legend-entry')
            .merge(entries)
            .each(function (d, i) {
            var entry = d3.select(this);
            var chartElement = d3
                .select(d.selector)
                .select('path')
                .node();
            if (chartElement) {
                var style_1 = window.getComputedStyle(chartElement);
                var chart = that.axis.charts.filter(function (x) { return x.id === d.selector; });
                if (chart[0] instanceof Charts_1.ChartLine) {
                    entry
                        .append('line')
                        .attr('x1', 0)
                        .attr('x2', 20)
                        .attr('y1', 0)
                        .attr('y2', 0)
                        .style('stroke', style_1.getPropertyValue('stroke'))
                        .style('stroke-width', style_1.getPropertyValue('stroke-width'))
                        .style('stroke-dasharray', style_1.getPropertyValue('stroke-dasharray'));
                }
                else if (chart[0] instanceof Charts_1.ChartArea) {
                    entry
                        .append('rect')
                        .attr('x', 0)
                        .attr('y', -5)
                        .attr('width', 20)
                        .attr('height', 10)
                        .style('fill', style_1.getPropertyValue('fill'));
                }
                entry.on('click', function () {
                    var display = style_1.getPropertyValue('visibility');
                    if (display === 'visible') {
                        d3.selectAll(d.selector).style('visibility', 'hidden');
                        entry.style('opacity', 0.5);
                    }
                    else {
                        d3.selectAll(d.selector).style('visibility', 'visible');
                        entry.style('opacity', 1.0);
                    }
                });
            }
            else {
                entry
                    .append('circle')
                    .attr('class', 'spinner')
                    .attr('cx', 10)
                    .attr('cy', 0)
                    .attr('r', 8);
            }
            entry
                .append('text')
                .text(d.label)
                .attr('x', 25)
                .attr('dy', '0.32em');
            maxWidth = Math.max(maxWidth, entry.node().getBoundingClientRect().width);
        });
        // update
        var columns = Math.floor(this.axis.width / maxWidth);
        if (columns >= this.labels.length)
            columns = this.labels.length;
        else {
            var rows_1 = Math.ceil(this.labels.length / columns);
            var lastRow = this.labels.length % columns;
            if (columns - lastRow > rows_1 - 1)
                columns--;
        }
        var rows = Math.ceil(this.labels.length / columns);
        var dx = Math.floor(this.axis.width / columns);
        var y = 10;
        var dy = 15;
        enter.attr('transform', function (d, i) {
            var column = Math.floor(i / rows);
            var row = i % rows;
            return 'translate(' + column * dx + ',' + (y + row * dy) + ')';
        });
    };
    return Legend;
}());
exports.Legend = Legend;
//# sourceMappingURL=legend.js.map