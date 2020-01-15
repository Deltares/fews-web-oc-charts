"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var d3 = require("d3");
var scaleWindCategories = d3.scaleQuantize()
    .domain([-11.25, 371.25])
    .range([
    "N", "NNW", 'NW', "WNW",
    'W', "WZW", 'ZW', "ZZW",
    'Z', "ZZO", 'ZO', "OZO",
    "O", "ONO", 'NO', 'NNO', 'N'
]);
exports.scaleWindCategories = scaleWindCategories;
var beaufortLimits = [.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
var beaufortLabels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
var scaleBeaufort = d3.scaleThreshold()
    .domain(beaufortLimits)
    .range(beaufortLabels);
exports.scaleBeaufort = scaleBeaufort;
//# sourceMappingURL=wind.js.map