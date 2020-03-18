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
function mean(x) {
    if (x instanceof Array) {
        return d3.mean(x);
    }
    return x;
}
var ChartMarker = /** @class */ (function (_super) {
    __extends(ChartMarker, _super);
    function ChartMarker() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.previousData = [];
        return _this;
    }
    ChartMarker.prototype.plotterCartesian = function (axis, dataKeys) {
        var xkey = dataKeys.xkey ? dataKeys.xkey : 'x';
        var ykey = dataKeys.ykey ? dataKeys.ykey : 'y';
        this.group = this.selectGroup(axis, 'chart-marker');
        var symbolId = this.options.symbolId ? this.options.symbolId : 0;
        var elements = this.group.selectAll('path').data(this.data);
        // exit selection
        elements.exit().remove();
        var that = this;
        // enter + update selection
        elements
            .enter()
            .append('path')
            .on('mouseover', function (d) {
            var v = { x: d[xkey], y: d[ykey] };
            axis.showTooltip(that.toolTipFormatterCartesian(v));
        })
            .on('mouseout', function (d) {
            axis.hideTooltip(d);
        })
            .attr('d', d3.symbol().type(d3.symbols[symbolId]))
            .merge(elements)
            .attr('transform', function (d, i) {
            return 'translate(' + axis.xScale(d[xkey]) + ',' + axis.yScale(d[ykey]) + ')';
        });
    };
    ChartMarker.prototype.plotterPolar = function (axis, dataKeys) {
        this.group = this.selectGroup(axis, 'chart-marker');
        var symbolId = this.options.symbolId ? this.options.symbolId : 0;
        var tkey = dataKeys.tkey ? dataKeys.tkey : 't';
        var rkey = dataKeys.rkey ? dataKeys.rkey : 'r';
        var elements = this.group.selectAll('path').data(this.data);
        function arcTranslation(p) {
            // We only use 'd', but list d,i,a as params just to show can have them as params.
            // Code only really uses d and t.
            return function (d, i, a) {
                var old = p[i];
                if (mean(old[tkey]) - mean(d[tkey]) > 180) {
                    old[tkey] = old[tkey] - 360;
                }
                else if (mean(old[tkey]) - mean(d[tkey]) < -180) {
                    old[tkey] = old[tkey] + 360;
                }
                var tInterpolate = d3.interpolate(old[tkey], d[tkey]);
                var rInterpolate = d3.interpolate(old[rkey], d[rkey]);
                return function (t) {
                    var theta = axis.angularScale(tInterpolate(t));
                    var radius = axis.radialScale(rInterpolate(t));
                    return 'translate(' + -radius * Math.sin(-theta) + ',' + -radius * Math.cos(-theta) + ')';
                };
            };
        }
        // exit selection
        elements.exit().remove();
        var that = this;
        // enter + update selection
        elements
            .enter()
            .append('path')
            .attr('transform', function (d, i) {
            var r = axis.radialScale(d[rkey]);
            var t = axis.angularScale(d[tkey]);
            return 'translate(' + -r * Math.sin(-t) + ',' + -r * Math.cos(-t) + ')';
        })
            .attr('d', d3.symbol().type(d3.symbols[symbolId]))
            .on('mouseover', function (d) {
            var v = { r: d[rkey], t: d[tkey] };
            axis.showTooltip(that.toolTipFormatterPolar(v));
        })
            .on('mouseout', function (d) {
            axis.hideTooltip(d);
        })
            .merge(elements);
        var t = d3
            .transition()
            .duration(this.options.transitionTime)
            .ease(d3.easeLinear);
        elements.transition(t).attrTween('transform', arcTranslation(this.previousData));
        this.previousData = this.data;
    };
    return ChartMarker;
}(chart_1.Chart));
exports.ChartMarker = ChartMarker;
//# sourceMappingURL=chartMarker.js.map