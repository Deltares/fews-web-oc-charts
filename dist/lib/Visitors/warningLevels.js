"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var d3 = require("d3");
var WarningLevels = /** @class */ (function () {
    function WarningLevels(escalationLevels) {
        this.escalationLevels = escalationLevels;
        this.transitionTime = 0;
    }
    WarningLevels.prototype.visit = function (axis) {
        this.axis = axis;
        this.create(axis);
    };
    WarningLevels.prototype.create = function (axis) {
        var scale = (this.scale = d3.scaleLinear());
        this.scale.domain(axis.yScale.domain()).range(axis.yScale.range());
        var escalationLevels = this.escalationLevels;
        var tickValues = escalationLevels
            .filter(function (el) {
            var domain = scale.domain();
            return el.val >= domain[0] && el.val <= domain[1];
        })
            .map(function (el) {
            return el.val;
        });
        this.warningAxis = d3
            .axisRight(this.scale)
            .tickValues(tickValues)
            .tickFormat(function (d, i) {
            var level;
            for (var _i = 0, escalationLevels_1 = escalationLevels; _i < escalationLevels_1.length; _i++) {
                level = escalationLevels_1[_i];
                if (level.val === d)
                    break;
            }
            return level.id;
        });
        this.group = d3;
        axis.canvas
            .append('g')
            .attr('class', 'axis y2-axis')
            .attr('transform', 'translate(' + axis.width + ' ,0)');
        var axisHandle = axis.canvas.select('.y2-axis').call(this.warningAxis);
        axisHandle
            .selectAll('.tick text')
            .append('title')
            .attr('class', 'tooltip')
            .text(function (d, i) {
            return 'waarschuwing waardes' + escalationLevels[i].c + '' + d;
        });
        if (!this.sections) {
            this.sections = this.axis.canvas
                .select('.axis-canvas')
                .append('g')
                .attr('class', 'warning-sections');
            this.sections
                .selectAll('rect')
                .data(this.warningAxis.tickValues())
                .enter()
                .append('rect');
        }
        this.redraw();
    };
    WarningLevels.prototype.redraw = function () {
        var escalationLevels = this.escalationLevels;
        var scale = this.scale.domain(this.axis.yScale.domain()).range(this.axis.yScale.range());
        var tickValues = escalationLevels
            .filter(function (el) {
            var domain = scale.domain();
            return el.val >= domain[0] && el.val <= domain[1];
        })
            .map(function (el) {
            return el.val;
        });
        this.warningAxis.tickValues(tickValues);
        var transition = d3.transition().duration(this.transitionTime);
        this.group
            .select('.y2-axis')
            .attr('transform', 'translate(' + this.axis.width + ' ,0)')
            .transition(transition)
            .call(this.warningAxis);
        var that = this;
        var escY = function (d, i) {
            if (escalationLevels[i].c === '<') {
                return that.scale(d);
            }
            else {
                if (i === escalationLevels.length - 1)
                    return 0;
                return that.scale(escalationLevels[i + 1].val);
            }
        };
        var escHeight = function (d, i) {
            if (escalationLevels[i].c === '<') {
                if (i === 0)
                    return Math.max(0, that.axis.height - that.scale(d));
                return Math.max(0, that.scale(escalationLevels[i - 1].val) - that.scale(d));
            }
            else {
                if (i === escalationLevels.length - 1)
                    return Math.max(0, that.scale(d));
                return Math.max(0, that.scale(d) - that.scale(escalationLevels[i + 1].val));
            }
        };
        var escFill = function (d, i) {
            return escalationLevels[i].color;
        };
        this.sections
            .selectAll('rect')
            .attr('y', escY)
            .attr('width', this.axis.width)
            .attr('height', escHeight)
            .attr('fill', escFill);
    };
    return WarningLevels;
}());
exports.WarningLevels = WarningLevels;
//# sourceMappingURL=warningLevels.js.map