import * as d3 from 'd3'
import { DateTime, Zone } from 'luxon'

export function dateFormatter(date: number | Date, format: string, options?: any ) : string {
  const timeZone = options?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const locale = options?.locale ?? navigator.language
  const dateTime = DateTime.fromJSDate(date as Date).setZone(timeZone).setLocale(locale);
  return dateTime.toFormat(format)
}

export function generateMultiFormat(timeZone: string | Zone, locale?: string) {
  return function (date: Date) {
    const m = DateTime.fromJSDate(date).setZone(timeZone).setLocale(locale ?? navigator.language)
    const offsetDate = new Date(date.getTime() + m.offset * 60000)
    let formatString: string
    if (d3.utcSecond(offsetDate) < offsetDate) {
      formatString = '.SSS'
    } else if (d3.utcMinute(offsetDate) < offsetDate) {
      formatString = ':ss'
    } else if (d3.utcHour(offsetDate) < offsetDate) {
      formatString = 'HH:mm'
    } else if (d3.utcDay(offsetDate) < offsetDate) {
      formatString = 'HH:mm'
    } else if (d3.utcMonth(offsetDate) < offsetDate) {
      formatString = d3.utcWeek(offsetDate) < offsetDate
        ? m.toFormat('EEE dd')
        : m.toFormat('MMM dd')
    } else {
      formatString = d3.utcYear(offsetDate) < offsetDate
        ? m.toFormat('MMMM')
        : m.toFormat('yyyy')
      }
    return m.toFormat(formatString)
  }
}
