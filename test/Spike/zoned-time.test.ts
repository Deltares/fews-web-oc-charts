import { describe, expect, test } from 'vitest'
import {
  findTransitions,
  zoneOffset,
  zonedParts,
  zonedTicks,
} from '../../src/spike/time/zoned-time.js'

const instant = (value: string) => Date.parse(value)

describe('phase 0 Intl time-zone prototype', () => {
  test('returns offsets for current and historical timezone rules', () => {
    expect(zoneOffset('Europe/Amsterdam', instant('2024-03-31T00:30:00Z'))).toBe(60)
    expect(zoneOffset('Europe/Amsterdam', instant('2024-03-31T01:30:00Z'))).toBe(120)
    expect(zoneOffset('America/Mexico_City', instant('2024-07-01T12:00:00Z'))).toBe(-360)
    expect(zoneOffset('Australia/Lord_Howe', instant('2024-10-05T15:29:00Z'))).toBe(630)
    expect(zoneOffset('Australia/Lord_Howe', instant('2024-10-05T15:30:00Z'))).toBe(660)
    expect(zoneOffset('Asia/Kolkata', instant('2024-01-01T00:00:00Z'))).toBe(330)
    expect(zoneOffset('UTC', instant('2024-01-01T00:00:00Z'))).toBe(0)
  })

  test('omits nonexistent spring-forward hours and emits both fall-back instants', () => {
    const spring = zonedTicks(
      'Europe/Amsterdam',
      instant('2024-03-31T00:00:00Z'),
      instant('2024-03-31T03:00:00Z'),
      'hour',
    )
    expect(spring.map((tick) => new Date(tick).toISOString())).toEqual([
      '2024-03-31T00:00:00.000Z',
      '2024-03-31T01:00:00.000Z',
      '2024-03-31T02:00:00.000Z',
      '2024-03-31T03:00:00.000Z',
    ])

    const fall = zonedTicks(
      'Europe/Amsterdam',
      instant('2024-10-27T00:00:00Z'),
      instant('2024-10-27T03:00:00Z'),
      'hour',
    )
    expect(fall.map((tick) => new Date(tick).toISOString())).toEqual([
      '2024-10-27T00:00:00.000Z',
      '2024-10-27T01:00:00.000Z',
      '2024-10-27T02:00:00.000Z',
      '2024-10-27T03:00:00.000Z',
    ])
    expect(fall.slice(0, 2).map((tick) => zonedParts('Europe/Amsterdam', tick).hour)).toEqual([
      2, 2,
    ])
  })

  test('resolves local midnights across month boundaries and finds non-hour transitions', () => {
    const daily = zonedTicks(
      'Asia/Kolkata',
      instant('2024-01-29T18:30:00Z'),
      instant('2024-02-01T18:30:00Z'),
      'day',
    )
    expect(daily.map((tick) => zonedParts('Asia/Kolkata', tick).day)).toEqual([30, 31, 1, 2])

    const transitions = findTransitions(
      'Australia/Lord_Howe',
      instant('2024-10-05T00:00:00Z'),
      instant('2024-10-06T00:00:00Z'),
    )
    expect(transitions).toEqual([
      {
        instant: instant('2024-10-05T15:30:00Z'),
        fromOffset: 630,
        toOffset: 660,
      },
    ])
    expect(
      findTransitions(
        'America/Mexico_City',
        instant('2024-01-01T00:00:00Z'),
        instant('2025-01-01T00:00:00Z'),
      ),
    ).toEqual([])
  })

  test('rejects invalid zones and domains instead of returning fallback values', () => {
    expect(() => zoneOffset('Invalid/Zone', 0)).toThrow()
    expect(() => zonedTicks('UTC', 2, 1, 'hour')).toThrow(/ordered bounds/)
  })
})
