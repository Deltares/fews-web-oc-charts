"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var moment_timezone_1 = require("moment-timezone");
require("moment/locale/nl");
function dateFormatter(date, format, options) {
    var moment = moment_timezone_1.default(date).tz(options.timeZone);
    moment.locale('nl-NL');
    return moment.format(format);
}
exports.dateFormatter = dateFormatter;
//# sourceMappingURL=date.js.map