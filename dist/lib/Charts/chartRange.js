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
var ChartRange = /** @class */ (function (_super) {
    __extends(ChartRange, _super);
    function ChartRange() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.previousData = [];
        return _this;
    }
    Object.defineProperty(ChartRange.prototype, "extent", {
        get: function () {
            if (!this._extent) {
                this._extent = Array();
                var _loop_1 = function (key) {
                    var path = this_1.dataKeys[key];
                    var min = d3.min(this_1._data, function (d) {
                        if (d[path] === null)
                            return undefined;
                        return d3.min(d[path]);
                    });
                    var max = d3.max(this_1._data, function (d) {
                        if (d[path] === null)
                            return undefined;
                        return d3.max(d[path]);
                    });
                    this_1._extent[path] = [min, max];
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
    ChartRange.prototype.toolTipFormatterCartesian = function (d) {
        var html = '';
        if (this.options.x.includeInTooltip) {
            if (d.x[0] != d.x[1]) {
                html += 'x: ' + d.x[0].toFixed(2) + '-' + d.x[1].toFixed(2) + '<br/>';
            }
        }
        if (this.options.y.includeInTooltip) {
            if (d.y[0] != d.y[1]) {
                html += 'y: ' + d.y[0].toFixed(2) + '-' + d.y[1].toFixed(2);
            }
        }
        return html;
    };
    ChartRange.prototype.toolTipFormatterPolar = function (d) {
        var html = '';
        if (this.options.t.includeInTooltip) {
            if (d.t[0] != d.t[1]) {
                html += 't: ' + d.t[0].toFixed(0) + '-' + d.t[1].toFixed(0) + '<br/>';
            }
        }
        if (this.options.r.includeInTooltip) {
            if (d.r[0] != d.r[1]) {
                html += 'r: ' + d.r[0].toFixed(0) + '-' + d.r[1].toFixed(0);
            }
        }
        return html;
    };
    ChartRange.prototype.plotterCartesian = function (axis, dataKeys) {
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
        var mappedData = this.data.map(function (d) {
            return {
                x: d[xkey].map(axis.xScale),
                y: d[ykey].map(axis.yScale),
                color: colorMap(colorScale(mean(d[colorkey])))
            };
        });
        this.group = this.selectGroup(axis, 'chart-range');
        var elements = this.group.selectAll('rect').data(mappedData);
        var t = d3
            .transition()
            .duration(this.options.transitionTime)
            .ease(d3.easeLinear);
        var that = this;
        // exit
        elements.exit().remove();
        // update + enter
        var update = elements
            .enter()
            .append('rect')
            .attr('x', function (d) {
            return d.x[0];
        })
            .attr('y', function (d) {
            return d.y[1];
        })
            .attr('width', function (d) {
            return d.x[1] - d.x[0];
        })
            .attr('height', function (d) {
            return d.y[0] - d.y[1];
        })
            .on('mouseover', function (d) {
            axis.showTooltip(that.toolTipFormatterCartesian(d));
        })
            .on('mouseout', function (d) {
            axis.hideTooltip(d);
        });
        if (colorkey) {
            update.style('fill', function (d) {
                return d.color;
            });
        }
        var enter = elements
            .transition(t)
            .attr('x', function (d) {
            return d.x[0];
        })
            .attr('y', function (d) {
            return d.y[1];
        })
            .attr('width', function (d) {
            return d.x[1] - d.x[0];
        })
            .attr('height', function (d) {
            return d.y[0] - d.y[1];
        });
        if (colorkey) {
            enter.style('fill', function (d) {
                return d.color;
            });
        }
    };
    ChartRange.prototype.plotterPolar = function (axis, dataKeys) {
        var canvas = axis.canvas;
        var tkey = dataKeys.tkey ? dataKeys.tkey : 't';
        var rkey = dataKeys.rkey ? dataKeys.rkey : 'r';
        var colorkey = dataKeys.colorkey;
        var colorScale = d3.scaleLinear().domain([0, 1]);
        if (this.options.colorScale === chart_1.AUTO_SCALE) {
            colorScale.domain(d3.extent(this.data, function (d) {
                return d[colorkey];
            }));
        }
        var colorMap = this.colorMap;
        var mappedData = this.data.map(function (d) {
            return {
                r: d[rkey],
                t: d[tkey],
                color: colorMap(colorScale(mean(d[colorkey])))
            };
        });
        var t = d3
            .transition()
            .duration(this.options.transitionTime)
            .ease(d3.easeLinear);
        var arcGenerator = d3
            .arc()
            .innerRadius(function (d, i) {
            return axis.radialScale(d.r[0]);
        })
            .outerRadius(function (d, i) {
            return axis.radialScale(d.r[1]);
        })
            .startAngle(function (d, i) {
            return axis.angularScale(d.t[0]);
        })
            .endAngle(function (d, i) {
            return axis.angularScale(d.t[1]);
        });
        this.group = this.selectGroup(axis, 'chart-range');
        var elements = this.group.selectAll('path').data(mappedData);
        elements.exit().remove();
        var that = this;
        var enter = elements
            .enter()
            .append('path')
            .attr('d', arcGenerator)
            .on('mouseover', function (d) {
            axis.showTooltip(that.toolTipFormatterPolar(d));
        })
            .on('mouseout', function (d) {
            axis.hideTooltip(d);
        });
        if (colorkey) {
            enter.style('fill', function (d) {
                return d.color;
            });
        }
        var update = elements.transition(t).call(arcTween, this.previousData);
        if (colorkey) {
            update.style('fill', function (d) {
                return d.color;
            });
        }
        this.previousData = mappedData;
        function arcTween(transition, p) {
            transition.attrTween('d', function (d, i, a) {
                var old = p[i];
                if (mean(old.t) - mean(d.t) > 180) {
                    old.t = old.t.map(function (x) {
                        return x - 360;
                    });
                }
                else if (mean(old.t) - mean(d.t) < -180) {
                    old.t = old.t.map(function (x) {
                        return x + 360;
                    });
                }
                var tInterpolate = d3.interpolateArray(old.t, d.t);
                var rInterpolate = d3.interpolateArray(old.r, d.r);
                return function (t) {
                    d.t = tInterpolate(t);
                    d.r = rInterpolate(t);
                    return arcGenerator(d);
                };
            });
        }
    };
    return ChartRange;
}(chart_1.Chart));
exports.ChartRange = ChartRange;
//# sourceMappingURL=chartRange.js.map