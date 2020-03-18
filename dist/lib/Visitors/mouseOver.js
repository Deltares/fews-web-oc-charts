"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var d3 = require("d3");
var Utils_1 = require("../Utils");
var MouseOver = /** @class */ (function () {
    function MouseOver(trace) {
        this.trace = trace;
    }
    MouseOver.prototype.visit = function (axis) {
        this.axis = axis;
        this.create(axis);
    };
    MouseOver.prototype.create = function (axis) {
        var mouseG = axis.canvas.select('.mouse-events');
        if (mouseG.size() === 0) {
            mouseG = axis.canvas
                .append('g')
                .attr('class', 'mouse-events')
                .append('svg:rect')
                .attr('width', axis.width)
                .attr('height', axis.height)
                .attr('fill', 'none')
                .attr('pointer-events', 'all');
        }
        this.group = axis.canvas.insert('g', '.mouse-events').attr('class', 'mouse-over');
        this.group
            .append('path')
            .attr('class', 'mouse-line')
            .style('opacity', '0')
            .attr('d', function () {
            var d = 'M' + 0 + ',' + axis.height;
            d += ' ' + 0 + ',' + 0;
            return d;
        });
        this.group
            .append('g')
            .attr('class', 'mouse-x')
            .attr('transform', 'translate(' + 0 + ',' + axis.height + ')')
            .append('text')
            .text('');
        var mousePerLine = this.group
            .selectAll('.mouse-per-line')
            .data(this.trace)
            .enter()
            .append('g')
            .attr('class', 'mouse-per-line');
        mousePerLine
            .append('circle')
            .attr('r', 3)
            // .style("stroke", 'white')
            .style('fill', 'white')
            .style('stroke-width', '1px')
            .style('opacity', '0');
        var that = this;
        mouseG
            .on('mouseout', function () {
            // on mouse out hide line, circles and text
            that.group.select('.mouse-line').style('opacity', '0');
            that.group.selectAll('.mouse-per-line circle').style('opacity', '0');
            that.group.select('.mouse-x text').style('fill-opacity', '0');
            axis.hideTooltip(null);
        })
            .on('mouseover', function () {
            // on mouse in show line, circles and text
            that.group.select('.mouse-line').style('opacity', '1');
            that.group
                .selectAll('.mouse-per-line circle')
                .style('opacity', '1')
                .style('fill', function (d, i) {
                var element = d3.select(d).select('path');
                if (element.node() === null)
                    return;
                var stroke = window
                    .getComputedStyle(element.node())
                    .getPropertyValue('stroke');
                return stroke;
            });
            that.group.select('.mouse-x text').style('fill-opacity', '1');
            axis.tooltip
                .transition()
                .duration(50)
                .style('opacity', 0.9);
        })
            .on('mousemove', function () {
            // mouse moving over canvas
            var mouse = d3.mouse(this);
            var bisect = d3.bisector(function (d) {
                return d.x;
            }).right;
            var popupData = {};
            var posx = mouse[0];
            var allHidden = true;
            axis.canvas.selectAll('.mouse-per-line').attr('transform', function (d, i) {
                var element = axis.canvas.select(d).select('path');
                if (element.node() === null)
                    return 'translate(0,' + -window.innerHeight + ')';
                var style = window.getComputedStyle(element.node());
                if (style === null || style.getPropertyValue('visibility') === 'hidden') {
                    return 'translate(0,' + -window.innerHeight + ')';
                }
                allHidden = false;
                var stroke = style.getPropertyValue('stroke');
                var datum = element.datum();
                if (datum === null || datum.length === 0) {
                    return 'translate(0,' + -window.innerHeight + ')';
                }
                var mouseValue = axis.xScale.invert(mouse[0]);
                var idx = bisect(datum, mouseValue);
                if (idx === 0 && datum[idx].x >= mouseValue) {
                    return 'translate(0,' + -window.innerHeight + ')';
                }
                if (!datum[idx] || datum[idx].y === null) {
                    return 'translate(0,' + -window.innerHeight + ')';
                }
                var valy = datum[idx].y;
                var posy = axis.yScale(valy);
                posx = axis.xScale(datum[idx].x);
                var yLabel;
                if (Array.isArray(posy)) {
                    var labels = posy;
                    for (var i_1 = 0; i_1 < posy.length; i_1++) {
                        labels[i_1] = axis.yScale.invert(posy[i_1]).toFixed(2);
                    }
                    yLabel = labels.join(':');
                    posy = posy[0];
                }
                else {
                    yLabel = valy.toFixed(2);
                }
                posy =
                    posy < axis.yScale.range()[1] || posy > axis.yScale.range()[0]
                        ? -window.innerHeight
                        : posy;
                popupData[d] = { x: axis.xScale.invert(datum[idx].x), y: yLabel, color: stroke };
                return 'translate(' + posx + ',' + posy + ')';
            });
            // update line
            that.group.select('.mouse-line').attr('transform', 'translate(' + posx + ',' + 0 + ')');
            // update x-value
            that.group
                .select('.mouse-x')
                .attr('transform', 'translate(' + (posx + 2) + ',' + (axis.height - 5) + ')')
                .select('text')
                .text(Utils_1.dateFormatter(axis.xScale.invert(posx), 'YYYY-MM-DD HH:mm z', { timeZone: that.axis.timeZone }));
            if (allHidden) {
                axis.hideTooltip(null);
                return;
            }
            var htmlContent = '';
            for (var label in popupData) {
                var v = popupData[label];
                htmlContent += '<span style="color:' + v.color + ' ">' + '   ' + v.y + '</span><br/>';
            }
            var div = axis.tooltip.html(htmlContent);
            var h = div.node().clientHeight / 2;
            div.style('left', d3.event.pageX + 'px').style('top', d3.event.pageY - h + 'px');
        });
    };
    MouseOver.prototype.redraw = function () {
        var that = this;
        this.group.select('.mouse-line').attr('d', function () {
            var d = 'M' + 0 + ',' + that.axis.height;
            d += ' ' + 0 + ',' + 0;
            return d;
        });
    };
    return MouseOver;
}());
exports.MouseOver = MouseOver;
//# sourceMappingURL=mouseOver.js.map