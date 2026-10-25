export interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export interface ZonedTickLabels {
  primary: string
  secondary: string
}

type CalendarUnit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'

interface CalendarInterval {
  unit: CalendarUnit
  step: number
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()
const minute = 60_000
const hour = 60 * minute
const day = 24 * hour

function formatter(timeZone: string) {
  let value = formatterCache.get(timeZone)
  if (!value) {
    value = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatterCache.set(timeZone, value)
  }
  return value
}

export function zonedParts(timeZone: string, epochMs: number): ZonedParts {
  if (!Number.isFinite(epochMs) || Math.abs(epochMs) > 8.64e15) {
    throw new RangeError('epochMs must be a finite value within the JavaScript Date range.')
  }
  const values = new Map(
    formatter(timeZone)
      .formatToParts(new Date(epochMs))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  )
  const hour = values.get('hour')
  if (hour === undefined)
    throw new Error(`Intl did not return an hour for time zone "${timeZone}".`)
  return {
    year: values.get('year')!,
    month: values.get('month')!,
    day: values.get('day')!,
    hour: hour === 24 ? 0 : hour,
    minute: values.get('minute')!,
    second: values.get('second')!,
  }
}

export function zoneOffset(timeZone: string, epochMs: number): number {
  const parts = zonedParts(timeZone, epochMs)
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  const epochSecond = Math.floor(epochMs / 1000) * 1000
  return (localAsUtc - epochSecond) / minute
}

export function shiftZonedDays(timeZone: string, epochMs: number, days: number): number {
  if (!Number.isSafeInteger(days)) throw new RangeError('days must be a safe integer.')
  const parts = zonedParts(timeZone, epochMs)
  const milliseconds = ((epochMs % 1000) + 1000) % 1000
  const localDate = new Date(0)
  localDate.setUTCFullYear(parts.year, parts.month - 1, parts.day + days)
  localDate.setUTCHours(parts.hour, parts.minute, parts.second, milliseconds)
  const localTime = localDate.getTime()
  if (!Number.isFinite(localTime) || Math.abs(localTime) > 8.64e15) {
    throw new RangeError('Calendar day shift is outside the JavaScript Date range.')
  }
  const candidates = possibleInstants(timeZone, localTime - milliseconds)
  const originalOffset = zoneOffset(timeZone, epochMs)
  const sameOffset = candidates.find(
    (candidate) => zoneOffset(timeZone, candidate) === originalOffset,
  )
  let normalizedGap: number | undefined
  if (candidates.length === 0) {
    const localTarget = localTime - milliseconds
    const offsets = new Set<number>()
    for (let delta = -36; delta <= 36; delta += 3) {
      offsets.add(zoneOffset(timeZone, localTarget + delta * hour))
    }
    normalizedGap = [...offsets]
      .map((offset) => {
        const instant = localTarget - offset * minute
        const shifted = zonedParts(timeZone, instant)
        return {
          instant,
          local: Date.UTC(
            shifted.year,
            shifted.month - 1,
            shifted.day,
            shifted.hour,
            shifted.minute,
            shifted.second,
          ),
        }
      })
      .filter(({ local }) => local > localTarget)
      .sort((left, right) => left.local - right.local || left.instant - right.instant)[0]?.instant
  }
  const result =
    (sameOffset ??
      candidates[0] ??
      normalizedGap ??
      localTime - milliseconds - originalOffset * minute) + milliseconds
  if (!Number.isFinite(result) || Math.abs(result) > 8.64e15) {
    throw new RangeError('Calendar day shift is outside the JavaScript Date range.')
  }
  return result
}

function possibleInstants(timeZone: string, localTime: number): number[] {
  const offsets = new Set<number>()
  for (let delta = -36; delta <= 36; delta += 3) {
    offsets.add(zoneOffset(timeZone, localTime + delta * hour))
  }
  return [...offsets]
    .map((offset) => localTime - offset * minute)
    .filter((instant) => {
      const parts = zonedParts(timeZone, instant)
      return (
        Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) ===
        localTime
      )
    })
    .sort((left, right) => left - right)
}

function intervalFor(span: number, count: number): CalendarInterval {
  const intervals: readonly [CalendarUnit, number, number][] = [
    ['minute', 1, minute],
    ['minute', 5, 5 * minute],
    ['minute', 15, 15 * minute],
    ['minute', 30, 30 * minute],
    ['hour', 1, hour],
    ['hour', 3, 3 * hour],
    ['hour', 6, 6 * hour],
    ['hour', 12, 12 * hour],
    ['day', 1, day],
    ['day', 2, 2 * day],
    ['week', 1, 7 * day],
    ['week', 2, 14 * day],
    ['month', 1, 30.4375 * day],
    ['month', 3, 91.3125 * day],
    ['month', 6, 182.625 * day],
    ['year', 1, 365.25 * day],
    ['year', 2, 730.5 * day],
    ['year', 5, 1826.25 * day],
    ['year', 10, 3652.5 * day],
  ]
  const target = span / count
  let selected = intervals[0]
  let distance = Infinity
  for (const interval of intervals) {
    const nextDistance = Math.abs(Math.log(interval[2] / target))
    if (nextDistance < distance) {
      selected = interval
      distance = nextDistance
    }
  }
  return { unit: selected[0], step: selected[1] }
}

function floorCivil(parts: ZonedParts, interval: CalendarInterval): number {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  switch (interval.unit) {
    case 'minute':
      date.setUTCHours(parts.hour, Math.floor(parts.minute / interval.step) * interval.step)
      break
    case 'hour':
      date.setUTCHours(Math.floor(parts.hour / interval.step) * interval.step)
      break
    case 'day':
      date.setUTCDate(Math.floor((date.getUTCDate() - 1) / interval.step) * interval.step + 1)
      break
    case 'week':
      date.setUTCDate(date.getUTCDate() - date.getUTCDay())
      break
    case 'month':
      date.setUTCMonth(Math.floor((parts.month - 1) / interval.step) * interval.step)
      break
    case 'year':
      date.setUTCFullYear(Math.floor(parts.year / interval.step) * interval.step)
      date.setUTCMonth(0, 1)
      break
  }
  return date.getTime()
}

function nextCivil(localTime: number, interval: CalendarInterval): number {
  const next = new Date(localTime)
  switch (interval.unit) {
    case 'minute':
      next.setUTCMinutes(next.getUTCMinutes() + interval.step)
      break
    case 'hour':
      next.setUTCHours(next.getUTCHours() + interval.step)
      break
    case 'day':
      next.setUTCDate(next.getUTCDate() + interval.step)
      break
    case 'week':
      next.setUTCDate(next.getUTCDate() + interval.step * 7)
      break
    case 'month':
      next.setUTCMonth(next.getUTCMonth() + interval.step)
      break
    case 'year':
      next.setUTCFullYear(next.getUTCFullYear() + interval.step)
      break
  }
  return next.getTime()
}

/** Generates calendar-aligned ticks in instant order, including both sides of a fold. */
export function zonedTicks(
  timeZone: string,
  start: number,
  end: number,
  count: number | 'hour' | 'day',
): readonly number[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new RangeError('Tick domain must have finite, ordered bounds.')
  }
  if (typeof count === 'number' && (!Number.isInteger(count) || count <= 0)) {
    throw new RangeError('Tick count must be positive.')
  }
  if (start === end) return Object.freeze([start])
  const interval =
    typeof count === 'number' ? intervalFor(end - start, count) : { unit: count, step: 1 }
  const startParts = zonedParts(timeZone, start)
  const endParts = zonedParts(timeZone, end)
  const firstCivil = floorCivil(startParts, interval)
  const lastCivil = Date.UTC(
    endParts.year,
    endParts.month - 1,
    endParts.day,
    endParts.hour,
    endParts.minute,
  )
  const ticks: number[] = []
  let localTime = firstCivil
  let iterations = 0
  while (localTime <= lastCivil && iterations < 10_000) {
    for (const instant of possibleInstants(timeZone, localTime)) {
      if (instant >= start && instant <= end) ticks.push(instant)
    }
    localTime = nextCivil(localTime, interval)
    iterations += 1
  }
  if (localTime <= lastCivil) throw new RangeError('Tick domain produces more than 10,000 ticks.')
  if (ticks.length === 0) return Object.freeze([start, end])
  return Object.freeze(ticks.sort((left, right) => left - right))
}

export function formatZonedTickLabels(
  timeZone: string,
  locale: string,
  ticks: readonly number[],
  domain: readonly number[],
  count: number,
): readonly ZonedTickLabels[] {
  const interval = intervalFor(domain[1] - domain[0], count)
  const dateTime = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone, ...options })
  const primaryOptions: Intl.DateTimeFormatOptions =
    interval.unit === 'minute' || interval.unit === 'hour'
      ? { hour: '2-digit', minute: '2-digit' }
      : interval.unit === 'day' || interval.unit === 'week'
        ? { weekday: 'short' }
        : interval.unit === 'month'
          ? { month: 'short' }
          : { year: 'numeric' }
  const secondaryOptions: Intl.DateTimeFormatOptions =
    interval.unit === 'minute' || interval.unit === 'hour'
      ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }
      : interval.unit === 'day' || interval.unit === 'week'
        ? { day: 'numeric', month: 'short', year: 'numeric' }
        : interval.unit === 'month'
          ? { year: 'numeric' }
          : {}
  const primary = dateTime(primaryOptions)
  const secondary = Object.keys(secondaryOptions).length ? dateTime(secondaryOptions) : undefined
  const offsets = new Map<string, Set<number>>()
  for (const tick of ticks) {
    const label = primary.format(tick)
    let values = offsets.get(label)
    if (!values) offsets.set(label, (values = new Set()))
    values.add(zoneOffset(timeZone, tick))
  }
  let previousContext = ''
  return Object.freeze(
    ticks.map((tick) => {
      let label = primary.format(tick)
      if ((offsets.get(label)?.size ?? 0) > 1) {
        label += ` ${
          dateTime({ timeZoneName: 'shortOffset' })
            .formatToParts(tick)
            .find((part) => part.type === 'timeZoneName')?.value ?? ''
        }`
      }
      const context = secondary?.format(tick) ?? ''
      const secondaryLabel = context === previousContext ? '' : context
      previousContext = context
      return Object.freeze({ primary: label, secondary: secondaryLabel })
    }),
  )
}

export interface ZoneTransition {
  instant: number
  fromOffset: number
  toOffset: number
}

export function findTransitions(timeZone: string, start: number, end: number): ZoneTransition[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new RangeError('Transition search bounds must be finite and ordered.')
  }
  const transitions: ZoneTransition[] = []
  let intervalStart = Math.floor(start / minute) * minute
  let fromOffset = zoneOffset(timeZone, intervalStart)

  while (intervalStart < end) {
    const intervalEnd = Math.min(intervalStart + day, end)
    const toOffset = zoneOffset(timeZone, intervalEnd)
    if (toOffset !== fromOffset) {
      let low = intervalStart
      let high = intervalEnd
      while (high - low > minute) {
        const middle = Math.floor((low + high) / (2 * minute)) * minute
        if (zoneOffset(timeZone, middle) === fromOffset) low = middle
        else high = middle
      }
      const transitionInstant = high
      const newOffset = zoneOffset(timeZone, transitionInstant)
      transitions.push({ instant: transitionInstant, fromOffset, toOffset: newOffset })
      fromOffset = newOffset
    } else {
      fromOffset = toOffset
    }
    intervalStart = intervalEnd
  }

  return transitions
}
