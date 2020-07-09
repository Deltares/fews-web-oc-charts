import momenttz from 'moment-timezone';
import 'moment/locale/nl';
import * as d3 from 'd3'

export function dateFormatter(date: number | Date, format: string, options?: any ) : string {
  let moment = momenttz(date as Date).tz(options.timeZone)
  moment.locale('nl-NL');
  return moment.format(format)
}

export function generateMultiFormat(timeZone) {
  return function (date) {
    let m = momenttz(date as Date).tz(timeZone)
    let offsetDate = new Date(date.getTime() + m.utcOffset() * 60000)
    return (d3.utcSecond(offsetDate) < offsetDate
      ? m.format('.SSS')
      : d3.utcMinute(offsetDate) < offsetDate
        ? m.format(':ss')
        : d3.utcHour(offsetDate) < offsetDate
          ? m.format('HH:mm')
          : d3.utcDay(offsetDate) < offsetDate
            ? m.format('HH:mm')
            : d3.utcMonth(offsetDate) < offsetDate
              ? d3.utcWeek(offsetDate) < offsetDate
                ? m.format('dd DD')
                : m.format('MMM DD')
              : d3.utcYear(offsetDate) < offsetDate
                ? m.format('MMMM')
                : m.format('YYYY'))
  }
}
