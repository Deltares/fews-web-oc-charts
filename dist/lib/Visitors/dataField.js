"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Axis_1 = require("../Axis");
var d3_1 = require("d3");
var Utils_1 = require("../Utils");
var DataField = /** @class */ (function () {
    function DataField(container, options, formatter) {
        this.clickCount = 0;
        this.container = container;
        this.options = Utils_1.mergeRecursive({
            labelField: { dx: 0, dy: 0 },
            valueField: { dx: 0, dy: 0, units: [{ unit: '', factor: 1.0 }], precision: "0.1f" }
        }, options);
        this.formatter = formatter !== undefined ? formatter : this.valueFormatter;
    }
    DataField.prototype.visit = function (axis) {
        this.axis = axis;
        this.create(axis);
    };
    DataField.prototype.create = function (axis) {
        if (!this.group) {
            this.group = this.container.append('g').attr('class', 'data-field');
            this.text = this.group
                .append('text')
                .attr('class', 'data-field-label')
                .text(this.options.labelField.text);
            this.value = this.group.append('text').attr('class', 'data-field-value');
            this.text.attr('dx', this.options.labelField.dx);
            this.text.attr('dy', this.options.labelField.dy);
            this.value.attr('dx', this.options.valueField.dx);
            this.value.attr('dy', this.options.valueField.dy);
            var that_1 = this;
            if (this.options.valueField.units.length > 1) {
                this.value.on('click', function () { that_1.onClick(); });
                this.value.style('cursor', 'pointer');
            }
        }
        this.redraw();
    };
    DataField.prototype.redraw = function () {
        var element = this.axis.chartGroup.select(this.options.selector).select('path');
        var data = element.datum();
        var style = window.getComputedStyle(element.node());
        this.value.text(this.formatter(data));
        this.value.style('fill', style.getPropertyValue('stroke'));
    };
    DataField.prototype.onClick = function () {
        this.clickCount++;
        this.redraw();
    };
    DataField.prototype.valueFormatter = function (d) {
        var idx = this.clickCount % this.options.valueField.units.length;
        var value = this.getValue(d);
        var units = this.options.valueField.units[idx];
        if (value === null) {
            return '-' + units.unit;
        }
        if (units.factor !== undefined) {
            var format = units.precision !== undefined ? d3_1.format(units.precision) : d3_1.format(".1f");
            var valueString = value !== null ? format(value * units.factor) : '-';
            return valueString + units.unit;
        }
        else {
            var valueString = value !== null ? units.scale(value) : '-';
            return valueString + units.unit;
        }
    };
    DataField.prototype.getValue = function (d) {
        if (this.axis instanceof Axis_1.PolarAxis) {
            return d[0] !== undefined ? d[0].y : null;
        }
        else {
            return d[0] !== undefined ? d[0].x : null;
        }
    };
    return DataField;
}());
exports.DataField = DataField;
//# sourceMappingURL=dataField.js.map