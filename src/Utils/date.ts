import momenttz from 'moment-timezone';
import 'moment/locale/nl';

export function dateFormatter(date: number | Date, format: string, options?: any ) : string {
  let moment = momenttz(date as Date).tz(options.timeZone)
  moment.locale('nl-NL');
  return moment.format(format)
}
