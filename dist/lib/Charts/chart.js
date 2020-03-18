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
var Axis_1 = require("../Axis");
exports.AUTO_SCALE = 1;
function mean(x) {
    if (x instanceof Array) {
        return d3.mean(x);
    }
    return x;
}
var Chart = /** @class */ (function () {
    function Chart(data, options) {
        this.data = data;
        this.options = __assign({
            r: { includeInTooltip: true },
            t: { includeInTooltip: true },
            x: { includeInTooltip: true },
            y: { includeInTooltip: true },
            transitionTime: 100
        }, options);
        // https://github.com/d3/d3-scale-chromatic
        this.colorMap = d3.scaleSequential(d3.interpolateWarm);
    }
    Object.defineProperty(Chart.prototype, "data", {
        get: function () {
            return this._data;
        },
        set: function (d) {
            this._data = d;
            this.extent = null;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Chart.prototype, "extent", {
        get: function () {
            if (!this._extent) {
                this._extent = Array();
                var _loop_1 = function (key) {
                    var path = this_1.dataKeys[key];
                    this_1._extent[path] = d3.extent(this_1._data, function (d) {
                        return d[path];
                    });
                };
                var this_1 = this;
                for (var key in this.dataKeys) {
                    _loop_1(key);
                }
            }
            return this._extent;
        },
        set: function (extent) {
            this._extent = extent;
        },
        enumerable: true,
        configurable: true
    });
    Chart.prototype.addTo = function (axis, dataKeys, id) {
        this.id = id ? id : '';
        this.dataKeys = dataKeys;
        axis.charts.push(this);
        return this;
    };
    Chart.prototype.plotter = function (axis, dataKeys) {
        if (axis instanceof Axis_1.CartesianAxis) {
            this.plotterCartesian(axis, dataKeys);
        }
        else if (axis instanceof Axis_1.PolarAxis) {
            this.plotterPolar(axis, dataKeys);
        }
    };
    Chart.prototype.toolTipFormatterCartesian = function (d) {
        var html = '';
        if (this.options.x.includeInTooltip) {
            html += 'x: ' + d.x.toFixed(2) + '<br/>';
        }
        if (this.options.y.includeInTooltip) {
            html += 'y: ' + d.y.toFixed(2);
        }
        return html;
    };
    Chart.prototype.toolTipFormatterPolar = function (d) {
        var html = '';
        if (this.options.t.includeInTooltip) {
            html += 't: ' + d.t.toFixed(2) + '<br/>';
        }
        if (this.options.r.includeInTooltip) {
            html += 'r: ' + d.r.toFixed(2);
        }
        return html;
    };
    Chart.prototype.selectGroup = function (axis, cssClass) {
        if (this.group == null) {
            this.group = axis.chartGroup.append('g');
            if (axis instanceof Axis_1.PolarAxis) {
                var direction = -axis.direction;
                var intercept = 90 - axis.intercept;
                this.group.attr('transform', 'rotate(' + intercept + ')scale(' + direction + ' ,1)');
            }
            if (this.id.lastIndexOf('#', 0) === 0)
                this.group.attr('id', this.id.substr(1));
            if (this.id.lastIndexOf('.', 0) === 0) {
                this.group.attr('class', cssClass + ' ' + this.id.substr(1));
            }
            else {
                this.group.attr('class', cssClass);
            }
        }
        return this.group;
    };
    Chart.prototype.mapDataCartesian = function (axis, dataKeys, domain) {
        var xkey = dataKeys.xkey ? dataKeys.xkey : 'x';
        var ykey = dataKeys.ykey ? dataKeys.ykey : 'y';
        var bisectData = d3.bisector(function (d) {
            return d[xkey];
        });
        var i0 = bisectData.right(this.data, domain[0]);
        var i1 = bisectData.left(this.data, domain[1]);
        i0 = i0 > 0 ? i0 - 1 : 0;
        i1 = i1 < this.data.length - 1 ? i1 + 1 : this.data.length;
        var mappedData = this.data.slice(i0, i1).map(function (d) {
            return {
                x: d[xkey],
                y: d[ykey]
            };
        });
        return mappedData;
    };
    Chart.prototype.mapDataPolar = function (axis, dataKeys) {
        var tkey = dataKeys.tkey ? dataKeys.tkey : 't';
        var rkey = dataKeys.rkey ? dataKeys.rkey : 'r';
        var mappedData = this.data.map(function (d) {
            return {
                r: axis.radialScale(d[rkey]),
                t: axis.angularScale(d[tkey])
            };
        });
        return mappedData;
    };
    return Chart;
}());
exports.Chart = Chart;
//# sourceMappingURL=chart.js.map