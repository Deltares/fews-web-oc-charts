"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var d3 = require("d3");
var Utils_1 = require("../Utils");
var CurrentTime = /** @class */ (function () {
    function CurrentTime() {
        this.datetime = null;
    }
    CurrentTime.prototype.setDateTime = function (dt) {
        this.datetime = dt;
    };
    CurrentTime.prototype.visit = function (axis) {
        this.axis = axis;
        this.create(axis);
        var that = this;
        this.redraw();
        this.timer = d3.interval(function (elapsed) {
            that.redraw();
        }, CurrentTime.REFRESH_INTERVAL);
    };
    CurrentTime.prototype.create = function (axis) {
        if (!this.group) {
            this.group = axis.canvas.append('g').attr('class', 'current-time');
            this.line = this.group.append('line').attr('class', 'current-time');
        }
        this.redraw();
    };
    CurrentTime.prototype.redraw = function () {
        var currentDate = this.datetime || new Date();
        var x = this.axis.xScale(currentDate);
        var domain = this.axis.xScale.domain();
        if (!this.line) {
            this.line = this.group.append('line');
        }
        if (currentDate < domain[0] || currentDate > domain[1]) {
            this.group.attr('display', 'none');
        }
        else {
            this.group.attr('display', 'initial');
            this.line
                .attr('x1', x)
                .attr('x2', x)
                .attr('y1', this.axis.height)
                .attr('y2', 0);
            if (!this.indicator) {
                this.indicator = this.group.append('g').attr('class', 'current-time-indicator');
                this.indicator.append('polygon').attr('points', '0,0 5,5 -5,5');
                this.indicator.append('text');
            }
            this.indicator.attr('transform', 'translate(' + x + ',' + this.axis.height + ')');
            this.indicator
                .select('text')
                .attr('x', 5)
                .attr('y', -5)
                .text(Utils_1.dateFormatter(currentDate, 'YYYY-MM-DD HH:mm zz', { timeZone: this.axis.timeZone }));
        }
    };
    CurrentTime.REFRESH_INTERVAL = 10000;
    return CurrentTime;
}());
exports.CurrentTime = CurrentTime;
//# sourceMappingURL=currentTime.js.map