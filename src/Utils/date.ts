export function dateFormatter(locale, options) {
  let timezone = 'Etc/GMT' + options.timeZoneOffset / 60
  let dateFormatter
  let timeZoneOffset = options.timeZoneOffset
  try {
    dateFormatter = new Intl.DateTimeFormat(locale, options)
    return dateFormatter.format
  } catch (error) {
    options.timeZone = 'UTC'
    timezone = 'GMT+' + -(options.timeZoneOffset / 60)
    dateFormatter = new Intl.DateTimeFormat(locale, options)
    return function(date: Date) {
      return (
        dateFormatter.format(new Date(date.getTime() - timeZoneOffset * 60 * 1000)) + ' ' + timezone
      )
    }
  }
}
