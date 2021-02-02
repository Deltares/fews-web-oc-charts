import * as d3 from 'd3'
import { DateTime, Zone } from 'luxon'

export function dateFormatter(date: number | Date, format: string, options?: any ) : string {
  const dateTime = DateTime.fromJSDate(date as Date).setZone(options.timeZone).setLocale('nl-NL');
  return dateTime.toFormat(format)
}

export function generateMultiFormat(timeZone: string | Zone) {
  return function (date: Date) {
    const m = DateTime.fromJSDate(date).setZone(timeZone).setLocale('nl-NL')
    const offsetDate = new Date(date.getTime() + m.offset * 60000)
    return (d3.utcSecond(offsetDate) < offsetDate
      ? m.toFormat('.SSS')
      : d3.utcMinute(offsetDate) < offsetDate
        ? m.toFormat(':ss')
        : d3.utcHour(offsetDate) < offsetDate
          ? m.toFormat('HH:mm')
          : d3.utcDay(offsetDate) < offsetDate
            ? m.toFormat('HH:mm')
            : d3.utcMonth(offsetDate) < offsetDate
              ? d3.utcWeek(offsetDate) < offsetDate
                ? m.toFormat('EEE dd')
                : m.toFormat('MMM dd')
              : d3.utcYear(offsetDate) < offsetDate
                ? m.toFormat('MMMM')
                : m.toFormat('yyyy'))
  }
}
