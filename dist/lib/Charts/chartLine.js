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
var ChartLine = /** @class */ (function (_super) {
    __extends(ChartLine, _super);
    function ChartLine() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    ChartLine.prototype.plotterCartesian = function (axis, dataKeys) {
        var xkey = dataKeys.xkey ? dataKeys.xkey : 'x';
        var ykey = dataKeys.ykey ? dataKeys.ykey : 'y';
        var mappedData = this.mapDataCartesian(axis, dataKeys, axis.xScale.domain());
        var lineGenerator = d3
            .line()
            .x(function (d) {
            return axis.xScale(d.x);
        })
            .y(function (d) {
            return axis.yScale(d.y);
        })
            .defined(function (d) {
            return d.y != null;
        });
        this.group = this.selectGroup(axis, 'chart-line');
        if (this.group.select('path').size() === 0) {
            this.group.append('path');
        }
        this.group
            .select('path')
            .datum(mappedData)
            .attr('d', lineGenerator);
    };
    ChartLine.prototype.plotterPolar = function (axis, dataKeys) {
        var mappedData = this.mapDataPolar(axis, dataKeys);
        var tkey = dataKeys.tkey ? dataKeys.tkey : 't';
        var rkey = dataKeys.rkey ? dataKeys.rkey : 'r';
        var lineGenerator = d3
            .lineRadial()
            .angle(function (d) {
            return d.t;
        })
            .radius(function (d) {
            return d.r;
        });
        this.group = this.selectGroup(axis, 'chart-line');
        if (this.group.select('path').size() === 0) {
            this.group.append('path');
        }
        var line = this.group.select('path');
        var t = d3
            .transition()
            .duration(this.options.transitionTime)
            .ease(d3.easeLinear);
        line.transition(t).attr('d', lineGenerator(mappedData));
        line.datum(this.data);
    };
    return ChartLine;
}(chart_1.Chart));
exports.ChartLine = ChartLine;
//# sourceMappingURL=chartLine.js.map