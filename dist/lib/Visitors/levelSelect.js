"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var d3 = require("d3");
var LevelSelect = /** @class */ (function () {
    function LevelSelect(value, callback) {
        this.value = value;
        this.callback = callback;
        this.format = d3.format('.2f');
    }
    LevelSelect.prototype.visit = function (axis) {
        this.axis = axis;
        this.create(axis);
    };
    LevelSelect.prototype.create = function (axis) {
        if (!this.group) {
            this.group = axis.canvas.append('g').attr('class', 'level-select');
            this.group.append('line');
            var that_1 = this;
            this.group
                .append('polygon')
                .attr('points', '0,0 -5,-5 -8,-5 -8,5 -5,5')
                .attr('class', 'level-select-handle')
                .call(d3
                .drag()
                .on('start', function () {
                that_1.start(d3.event);
            })
                .on('drag', function () {
                that_1.drag(d3.event);
            })
                .on('end', function () {
                that_1.end(d3.event);
            }));
        }
        this.redraw();
    };
    LevelSelect.prototype.redraw = function () {
        var y = this.axis.yScale(this.value);
        y = (y === undefined) ? this.axis.yScale.range()[1] : y;
        // line
        this.group
            .select('line')
            .attr('x1', 0)
            .attr('x2', this.axis.width)
            .attr('transform', 'translate( 0, ' + y + ')');
        // text
        this.group
            .select('text')
            .attr('y', y)
            .text(this.format(this.value));
        // handle
        this.group.select('polygon').attr('transform', 'translate( 0, ' + y + ')');
    };
    LevelSelect.prototype.start = function (event) {
        this.value = this.axis.yScale.invert(event.y);
        this.group
            .append('text')
            .attr('x', 0)
            .attr('y', event.y)
            .attr('dx', 10)
            .attr('dy', -5)
            .text(this.format(this.value));
        this.redraw();
    };
    LevelSelect.prototype.drag = function (event) {
        this.value = this.axis.yScale.invert(event.y);
        this.redraw();
    };
    LevelSelect.prototype.end = function (event) {
        this.group.select('text').remove();
        if (typeof this.callback === 'function') {
            this.callback(this.value);
        }
    };
    return LevelSelect;
}());
exports.LevelSelect = LevelSelect;
//# sourceMappingURL=levelSelect.js.map