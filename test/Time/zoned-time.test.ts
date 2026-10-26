import { describe, expect, test } from 'vitest'
import {
  formatZonedTickLabels,
  shiftZonedDays,
  zoneOffset,
  zonedParts,
  zonedTicks,
} from '../../src/time/zoned-time.js'

const instant = (value: string) => Date.parse(value)

describe('public civil-time tick generation', () => {
  test.each([1000.25, -1000.25, -0.25])(
    'preserves fractional milliseconds when shifting %s by calendar days',
    (epoch) => {
      expect(zoneOffset('UTC', epoch)).toBe(0)
      expect(shiftZonedDays('UTC', epoch, 0)).toBe(epoch)
      expect(shiftZonedDays('UTC', epoch, 1)).toBe(epoch + 86_400_000)
      expect(shiftZonedDays('UTC', epoch, -1)).toBe(epoch - 86_400_000)
    },
  )

  test('omits spring gaps and disambiguates repeated fall-back hours', () => {
    const spring = zonedTicks(
      'Europe/Amsterdam',
      instant('2024-03-31T00:00:00Z'),
      instant('2024-03-31T03:00:00Z'),
      3,
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
      3,
    )
    expect(fall.slice(0, 2).map((tick) => zonedParts('Europe/Amsterdam', tick).hour)).toEqual([
      2, 2,
    ])
    const labels = formatZonedTickLabels(
      'Europe/Amsterdam',
      'en-GB',
      fall,
      [fall[0], fall.at(-1)!],
      3,
    )
    expect(labels[0].primary).not.toBe(labels[1].primary)
  })

  test('aligns week and month ticks to local calendar boundaries', () => {
    const months = zonedTicks(
      'UTC',
      instant('2024-01-01T00:00:00Z'),
      instant('2024-07-01T00:00:00Z'),
      6,
    )
    expect(
      months.map((tick) => [zonedParts('UTC', tick).month, zonedParts('UTC', tick).day]),
    ).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
      [4, 1],
      [5, 1],
      [6, 1],
      [7, 1],
    ])

    const weeks = zonedTicks(
      'UTC',
      instant('2024-01-01T00:00:00Z'),
      instant('2024-02-01T00:00:00Z'),
      4,
    )
    expect(weeks.map((tick) => new Date(tick).getUTCDay())).toEqual([0, 0, 0, 0])
  })

  test('validates bounds and time zones', () => {
    expect(() => zonedTicks('UTC', 2, 1, 5)).toThrow(/ordered bounds/)
    expect(() => zonedTicks('UTC', 0, 1, 0)).toThrow(/positive/)
    expect(() => zonedTicks('Invalid/Zone', 0, 60_000, 1)).toThrow()
  })
})
