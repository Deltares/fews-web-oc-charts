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
var ChartArea = /** @class */ (function (_super) {
    __extends(ChartArea, _super);
    function ChartArea() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    ChartArea.prototype.plotterCartesian = function (axis, dataKeys) {
        var xkey = dataKeys.xkey ? dataKeys.xkey : 'x';
        var ykey = dataKeys.ykey ? dataKeys.ykey : 'y';
        var colorkey = dataKeys.colorkey;
        var colorScale = d3.scaleLinear().domain([0, 1]);
        if (this.options.colorScale === chart_1.AUTO_SCALE) {
            colorScale.domain(d3.extent(this.data, function (d) {
                return d[colorkey];
            }));
        }
        var colorMap = this.colorMap;
        var bisectX = d3.bisector(function (d) {
            return d[xkey];
        });
        var i0 = bisectX.right(this.data, axis.xScale.domain()[0]);
        var i1 = bisectX.left(this.data, axis.xScale.domain()[1]);
        i0 = i0 > 0 ? i0 - 1 : 0;
        i1 = i1 < this.data.length - 1 ? i1 + 1 : this.data.length;
        var mappedData = this.data.slice(i0, i1).map(function (d) {
            return {
                x: axis.xScale(d[xkey]),
                y: d[ykey].map(axis.yScale),
                color: colorMap(colorScale(mean(d[colorkey])))
            };
        });
        this.group = this.selectGroup(axis, 'chart-area');
        if (this.group.select('path').size() === 0) {
            this.group.append('path');
        }
        var areaGenerator = d3
            .area()
            .x(function (d) {
            return d.x;
        })
            .y0(function (d) {
            return d.y[0];
        })
            .y1(function (d) {
            return d.y[1];
        });
        var elements = this.group.datum(mappedData);
        var area = this.group.select('path');
        area.attr('d', areaGenerator(mappedData));
        area.datum(mappedData);
    };
    ChartArea.prototype.plotterPolar = function (axis, dataKeys) {
        console.error('plotterPolar is not implemented for ChartArea');
    };
    return ChartArea;
}(chart_1.Chart));
exports.ChartArea = ChartArea;
//# sourceMappingURL=chartArea.js.map