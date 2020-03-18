"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var d3 = require("d3");
var SelectionMode;
(function (SelectionMode) {
    SelectionMode[SelectionMode["CANCEL"] = 0] = "CANCEL";
    SelectionMode[SelectionMode["X"] = 1] = "X";
    SelectionMode[SelectionMode["XY"] = 2] = "XY";
    SelectionMode[SelectionMode["Y"] = 3] = "Y";
})(SelectionMode || (SelectionMode = {}));
var ZoomHandler = /** @class */ (function () {
    function ZoomHandler() {
        this.MINMOVE = 15;
    }
    ZoomHandler.prototype.visit = function (axis) {
        this.axis = axis;
        this.createHandler(axis);
    };
    ZoomHandler.prototype.createHandler = function (axis) {
        this.svg = axis.canvas;
        if (!this.brushGroup) {
            this.brushGroup = this.svg.append('g').attr('class', 'brush');
            this.brushGroup
                .append('rect')
                .attr('class', 'select-rect')
                .attr('visibility', 'hidden');
            this.brushGroup
                .append('rect')
                .attr('class', 'handle east')
                .attr('visibility', 'hidden')
                .attr('height', 2 * this.MINMOVE)
                .attr('width', 4);
            this.brushGroup
                .append('rect')
                .attr('class', 'handle west')
                .attr('visibility', 'hidden')
                .attr('height', 2 * this.MINMOVE)
                .attr('width', 4);
            this.brushGroup
                .append('rect')
                .attr('class', 'handle south')
                .attr('visibility', 'hidden')
                .attr('width', 2 * this.MINMOVE)
                .attr('height', 4);
            this.brushGroup
                .append('rect')
                .attr('class', 'handle north')
                .attr('visibility', 'hidden')
                .attr('width', 2 * this.MINMOVE)
                .attr('height', 4);
        }
        this.mouseGroup = this.svg.select('.mouse-events');
        if (this.mouseGroup.size() === 0) {
            this.mouseGroup = this.svg
                .append('g')
                .attr('class', 'mouse-events')
                .attr('pointer-events', 'all');
            var that_1 = this;
            var documentMouseUp_1 = function (event) {
                that_1.endSelection(null);
                document.removeEventListener('mouseup', documentMouseUp_1);
            };
            var mouseRect_1 = this.mouseGroup
                .append('rect')
                .attr('class', 'overlay')
                .attr('pointer-events', 'all');
            mouseRect_1
                .on('mousedown', function () {
                d3.event.preventDefault();
                that_1.initSelection(d3.mouse(this));
                document.addEventListener('mouseup', documentMouseUp_1);
            })
                .on('mouseup', function () {
                document.removeEventListener('mouseup', documentMouseUp_1);
                that_1.endSelection(d3.mouse(this));
            })
                .on('dblclick', function () {
                that_1.resetZoom(d3.mouse(this));
                that_1.mouseGroup.dispatch('mouseover');
            });
        }
        var mouseRect = this.mouseGroup
            .select('rect')
            .attr('height', this.axis.height)
            .attr('width', this.axis.width);
    };
    ZoomHandler.prototype.initSelection = function (point) {
        this.brushStartPoint = point;
        this.lastPoint = null;
        this.mode = SelectionMode.CANCEL;
        var that = this;
        this.mouseGroup.dispatch('mouseout');
        this.mouseGroup.select('.overlay').on('mousemove', function () {
            that.updateSelection(d3.mouse(this));
        });
        this.brushGroup
            .select('.select-rect')
            .attr('visibility', 'initial')
            .attr('width', 0)
            .attr('height', 0)
            .attr('x', 0)
            .attr('y', 0);
    };
    ZoomHandler.prototype.updateSelection = function (point) {
        if (!this.brushStartPoint)
            return;
        this.lastPoint = point;
        var m = [0, 0];
        m[0] = point[0] - this.brushStartPoint[0];
        m[1] = point[1] - this.brushStartPoint[1];
        var x = this.brushStartPoint[0];
        var y = this.brushStartPoint[1];
        var width = Math.abs(m[0]);
        var height = Math.abs(m[1]);
        var selectRect = this.brushGroup.select('.select-rect');
        if (m[0] < 0)
            x = this.brushStartPoint[0] + m[0];
        if (m[1] < 0)
            y = this.brushStartPoint[1] + m[1];
        if (Math.abs(m[0]) <= this.MINMOVE && Math.abs(m[1]) <= this.MINMOVE) {
            this.mode = SelectionMode.CANCEL;
            selectRect.attr('visibility', 'hidden');
            this.brushGroup.selectAll('.handle').attr('visibility', 'hidden');
        }
        else if (Math.abs(m[0]) > this.MINMOVE && Math.abs(m[1]) < this.MINMOVE) {
            this.mode = SelectionMode.X;
            selectRect
                .attr('width', width)
                .attr('x', x)
                .attr('y', 0)
                .attr('height', this.axis.height)
                .attr('visibility', 'initial');
            this.brushGroup
                .select('.west')
                .attr('visibility', 'initial')
                .attr('x', x - 4)
                .attr('y', this.brushStartPoint[1] - this.MINMOVE);
            this.brushGroup
                .select('.east')
                .attr('visibility', 'initial')
                .attr('x', x + width)
                .attr('y', this.brushStartPoint[1] - this.MINMOVE);
            this.brushGroup.select('.north').attr('visibility', 'hidden');
            this.brushGroup.select('.south').attr('visibility', 'hidden');
        }
        else if (Math.abs(m[1]) > this.MINMOVE && Math.abs(m[0]) < this.MINMOVE) {
            this.mode = SelectionMode.Y;
            selectRect
                .attr('height', height)
                .attr('y', y)
                .attr('x', 0)
                .attr('width', this.axis.width)
                .attr('visibility', 'initial');
            this.brushGroup
                .select('.north')
                .attr('visibility', 'initial')
                .attr('x', this.brushStartPoint[0] - this.MINMOVE)
                .attr('y', y - 4);
            this.brushGroup
                .select('.south')
                .attr('visibility', 'initial')
                .attr('y', y + height)
                .attr('x', this.brushStartPoint[0] - this.MINMOVE);
            this.brushGroup.select('.east').attr('visibility', 'hidden');
            this.brushGroup.select('.west').attr('visibility', 'hidden');
        }
        else {
            this.mode = SelectionMode.XY;
            selectRect
                .attr('height', height)
                .attr('y', y)
                .attr('x', x)
                .attr('width', width)
                .attr('visibility', 'initial');
            this.brushGroup.selectAll('.handle').attr('visibility', 'hidden');
        }
    };
    ZoomHandler.prototype.endSelection = function (point) {
        if (!this.brushStartPoint)
            return;
        point = point !== null ? point : this.lastPoint;
        this.mouseGroup.select('.overlay').on('mousemove', null);
        this.brushGroup.select('.select-rect').attr('visibility', 'hidden');
        var xScale = this.axis.xScale;
        var yScale = this.axis.yScale;
        switch (this.mode) {
            case SelectionMode.X: {
                var xExtent = d3.extent([point[0], this.brushStartPoint[0]].map(xScale.invert));
                this.axis.xScale.domain(xExtent);
                break;
            }
            case SelectionMode.Y: {
                var yExtent = d3.extent([point[1], this.brushStartPoint[1]].map(yScale.invert));
                this.axis.yScale.domain(yExtent);
                break;
            }
            case SelectionMode.XY: {
                var xExtent = d3.extent([point[0], this.brushStartPoint[0]].map(xScale.invert));
                var yExtent = d3.extent([point[1], this.brushStartPoint[1]].map(yScale.invert));
                this.axis.xScale.domain(xExtent);
                this.axis.yScale.domain(yExtent);
                break;
            }
            case SelectionMode.CANCEL: {
                this.brushGroup.selectAll('*').attr('visibility', 'hidden');
                return;
            }
            default: {
                return;
            }
        }
        this.brushGroup.selectAll('*').attr('visibility', 'hidden');
        this.mouseGroup.dispatch('mouseover');
        this.axis.zoom();
    };
    ZoomHandler.prototype.resetZoom = function (point) {
        this.axis.redraw({ x: { autoScale: true }, y: { autoScale: true } });
    };
    // FIXME: remove when IDrawble is introduced
    ZoomHandler.prototype.redraw = function () {
        this.mouseGroup
            .select('rect')
            .attr('height', this.axis.height)
            .attr('width', this.axis.width);
    };
    return ZoomHandler;
}());
exports.ZoomHandler = ZoomHandler;
//# sourceMappingURL=zoomHandler.js.map