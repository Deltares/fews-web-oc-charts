export interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export interface ZoneTransition {
  instant: number
  fromOffset: number
  toOffset: number
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()
const minute = 60_000

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

function possibleInstants(timeZone: string, localTime: number): number[] {
  const offsets = new Set<number>()
  for (let delta = -36; delta <= 36; delta += 6) {
    offsets.add(zoneOffset(timeZone, localTime + delta * 60 * minute))
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

/**
 * Returns local-hour or local-midnight boundaries in instant order. Missing
 * spring-forward hours are omitted and repeated fall-back hours emit both instants.
 */
export function zonedTicks(
  timeZone: string,
  start: number,
  end: number,
  interval: 'hour' | 'day',
): number[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new RangeError('Tick domain must have finite, ordered bounds.')
  }
  const startParts = zonedParts(timeZone, start)
  const endParts = zonedParts(timeZone, end)
  const step = interval === 'hour' ? 60 * minute : 24 * 60 * minute
  const civilStart = Date.UTC(
    startParts.year,
    startParts.month - 1,
    startParts.day,
    interval === 'hour' ? startParts.hour : 0,
  )
  const civilEnd = Date.UTC(
    endParts.year,
    endParts.month - 1,
    endParts.day,
    interval === 'hour' ? endParts.hour : 0,
  )
  const ticks: number[] = []
  for (let localTime = civilStart; localTime <= civilEnd; localTime += step) {
    for (const instant of possibleInstants(timeZone, localTime)) {
      if (instant >= start && instant <= end) ticks.push(instant)
    }
  }
  return ticks.sort((left, right) => left - right)
}

export function findTransitions(timeZone: string, start: number, end: number): ZoneTransition[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new RangeError('Transition search bounds must be finite and ordered.')
  }
  const transitions: ZoneTransition[] = []
  let intervalStart = Math.floor(start / minute) * minute
  let fromOffset = zoneOffset(timeZone, intervalStart)

  while (intervalStart < end) {
    const intervalEnd = Math.min(intervalStart + 24 * 60 * minute, end)
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
