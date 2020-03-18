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
var chart_1 = require("./chart");
var ChartHistogram = /** @class */ (function (_super) {
    __extends(ChartHistogram, _super);
    function ChartHistogram() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    ChartHistogram.prototype.plotterCartesian = function (axis, dataKeys) {
        var canvas = axis.canvas;
        var xkey = dataKeys.xkey ? dataKeys.xkey : 'x';
        var ykey = dataKeys.ykey ? dataKeys.ykey : 'y';
        var colorkey = dataKeys.colorkey ? dataKeys.colorkey : ykey;
        var data = this.data;
        var x0 = (3 * data[0][xkey] - data[1][xkey]) / 2;
        var x1 = (-data[data.length - 2][xkey] + 3 * data[data.length - 1][xkey]) / 2;
        // axis.xScale.domain([x0, x1])
        var histScale = d3.scaleBand().domain(data.map(function (d) {
            return d[xkey];
        }));
        histScale.range(axis.xScale.range());
        histScale.padding(0.05);
        var colorScale = d3.scaleLinear().domain([0, 1]);
        if (this.options.colorScale === chart_1.AUTO_SCALE) {
            colorScale.domain(d3.extent(this.data, function (d) {
                return d[colorkey];
            }));
        }
        var colorMap = this.colorMap;
        var mappedData = this.data.map(function (d) {
            return {
                x: d[xkey],
                y: d[ykey],
                color: colorMap(colorScale(d[colorkey]))
            };
        });
        this.group = this.selectGroup(axis, 'chart-range');
        var t = d3
            .transition()
            .duration(this.options.transitionTime)
            .ease(d3.easeLinear);
        var elements = this.group.selectAll('rect').data(mappedData);
        var that = this;
        // remove
        elements.exit().remove();
        // enter + update
        elements
            .enter()
            .append('rect')
            .style('fill', function (d) {
            return d.color;
        })
            .attr('y', function (d) {
            return d.y === null ? axis.height : axis.yScale(d.y);
        })
            .attr('height', function (d) {
            return d.y === null ? 0 : axis.height - axis.yScale(d.y);
        })
            .merge(elements)
            .attr('x', function (d) {
            return histScale(d.x);
        })
            .on('mouseover', function (d) {
            axis.showTooltip(that.toolTipFormatterCartesian(d));
        })
            .on('mouseout', function (d) {
            axis.hideTooltip(d);
        })
            .attr('width', histScale.bandwidth());
        elements
            .transition(t)
            .style('fill', function (d) {
            return d.color;
        })
            .attr('y', function (d) {
            return d.y === null ? axis.height : axis.yScale(d.y);
        })
            .attr('height', function (d) {
            return d.y === null ? 0 : axis.height - axis.yScale(d.y);
        });
    };
    ChartHistogram.prototype.plotterPolar = function (axis, dataKeys) {
        console.error('plotterPolar is not implemented for ChartHistogram');
    };
    return ChartHistogram;
}(chart_1.Chart));
exports.ChartHistogram = ChartHistogram;
//# sourceMappingURL=chartHistogram.js.map