"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var moment_timezone_1 = require("moment-timezone");
var DstIndicator = /** @class */ (function () {
    // tslint:disable-next-line:no-empty
    function DstIndicator() {
    }
    DstIndicator.prototype.visit = function (axis) {
        this.axis = axis;
        if (this.axis.options.x && this.axis.options.x.time) {
            this.create(axis);
        }
    };
    DstIndicator.prototype.create = function (axis) {
        if (!this.group) {
            this.group = axis.canvas.append('g').attr('class', 'dst-indicator');
        }
        this.redraw();
    };
    DstIndicator.prototype.redraw = function () {
        var domain = this.axis.xScale.domain();
        var startMoment = moment_timezone_1.default(domain[0]).tz(this.axis.timeZone);
        var endMoment = moment_timezone_1.default(domain[1]).tz(this.axis.timeZone);
        if (startMoment.isDST() !== endMoment.isDST()) {
            this.dstDate = this.findDst(startMoment, endMoment);
            var x = this.axis.xScale(this.dstDate);
            this.group.attr('display', 'initial');
            if (!this.indicator) {
                this.indicator = this.group.append('g').attr('class', 'dst-indicator');
                this.indicator.append('polygon').attr('points', '0,0 6,6 -6,6');
                this.indicator.append('text');
            }
            this.indicator.attr('transform', 'translate(' + x + ',' + this.axis.height + ')');
            this.indicator
                .select('text')
                .attr('x', 5)
                .attr('y', -5)
                .attr('text-anchor', 'middle')
                .text('dst transition');
        }
        else {
            this.group.attr('display', 'none');
        }
    };
    DstIndicator.prototype.findDst = function (startMoment, endMoment) {
        var m1 = startMoment.clone();
        var m2 = endMoment.clone();
        var duration = moment_timezone_1.default.duration(m2.diff(m1)).asMinutes();
        while (duration > 1) {
            var intermediate = m1.clone().add(duration / 2, "minutes");
            if (m1.utcOffset() === intermediate.utcOffset()) {
                m1 = intermediate;
            }
            else {
                m2 = intermediate;
            }
            duration = moment_timezone_1.default.duration(m2.diff(m1)).asMinutes();
        }
        console.log(m2.utcOffset() - m1.utcOffset());
        return m2.seconds(0).toDate();
    };
    return DstIndicator;
}());
exports.DstIndicator = DstIndicator;
//# sourceMappingURL=dstIndicator.js.map