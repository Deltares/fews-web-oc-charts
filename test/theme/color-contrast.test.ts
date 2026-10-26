import { describe, expect, test } from 'vitest'
import { rgb } from 'd3-color'
import {
  improveColorContrast,
  resolveMarkColor,
  tooltipColorTheme,
} from '../../src/theme/color-contrast.js'
import type { ThemeTokens } from '../../src/theme/theme.js'
import { resolveLineStyles, resolveCompositeStyle } from '../../src/plot/marks/mark-styles.js'

const theme: ThemeTokens = {
  colorContrast: 'auto',
  background: '#182026',
  foreground: '#edf2f4',
  grid: '#45545e',
  accent: '#66c2ff',
  tooltipBackground: '#000',
  tooltipColor: '#edf2f4',
  fontFamily: 'sans-serif',
  fontSize: 12,
}

function contrast(color: string, background: string) {
  const foreground = rgb(color)
  const back = rgb(background)
  const luminance = (channels: number[]) => {
    const values = channels.map((channel) => {
      const value = channel / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
  }
  const first = luminance(
    [foreground.r, foreground.g, foreground.b].map(
      (channel, i) =>
        channel * foreground.opacity + [back.r, back.g, back.b][i] * (1 - foreground.opacity),
    ),
  )
  const second = luminance([back.r, back.g, back.b])
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

function hue(color: string) {
  const value = rgb(color)
  const [r, g, b] = [value.r, value.g, value.b].map((channel) => {
    const v = channel / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return Math.atan2(
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
  )
}

describe('automatic color contrast', () => {
  test.each(['#fff', '#000', '#182026', '#807060'])(
    'meets numeric thresholds on background %s without changing adequate colors',
    (background) => {
      for (const color of [
        '#000',
        '#fff',
        '#222',
        '#eee',
        '#800000',
        '#000080',
        '#008000',
        'red',
        'lime',
        'blue',
        'cyan',
        'magenta',
        'yellow',
        'rebeccapurple',
        'hsl(35, 100%, 80%)',
      ]) {
        for (const target of [3, 4.5]) {
          const adjusted = improveColorContrast(color, background, target)
          expect(
            contrast(adjusted, background),
            `${color} on ${background}`,
          ).toBeGreaterThanOrEqual(target)
          if (contrast(color, background) >= target) expect(adjusted).toBe(color)
          else {
            expect(adjusted).not.toBe(color)
            expect(contrast(adjusted, background)).toBeLessThan(target + 0.12)
          }
          const channels = rgb(adjusted)
          for (const channel of [channels.r, channels.g, channels.b]) {
            expect(channel).toBeGreaterThanOrEqual(0)
            expect(channel).toBeLessThanOrEqual(255)
          }
        }
      }
    },
  )

  test.each([
    ['#800000', '#182026'],
    ['#000080', '#182026'],
    ['#008000', '#000'],
    ['#ffff00', '#fff'],
    ['#00ffff', '#fff'],
    ['#ffaaaa', '#fff'],
  ])('preserves the hue of %s against %s', (color, background) => {
    const adjusted = improveColorContrast(color, background, 4.5)
    const delta = hue(adjusted) - hue(color)
    expect(Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta)))).toBeLessThan(0.04)
    expect(contrast(adjusted, background)).toBeGreaterThanOrEqual(4.5)
  })

  test('meets targets across an sRGB sample grid and respects alpha-limited maxima', () => {
    for (const r of [0, 64, 128, 192, 255]) {
      for (const g of [0, 64, 128, 192, 255]) {
        for (const b of [0, 64, 128, 192, 255]) {
          for (const background of ['#fff', '#182026', '#777']) {
            for (const target of [3, 4.5]) {
              const color = rgb(r, g, b).formatRgb()
              expect(
                contrast(improveColorContrast(color, background, target), background),
              ).toBeGreaterThanOrEqual(target)
            }
          }
        }
      }
    }
    for (const background of ['#fff', '#182026', '#777']) {
      for (const alpha of [0.1, 0.5, 0.9]) {
        const maximum = Math.max(
          contrast(rgb(0, 0, 0, alpha).formatRgb(), background),
          contrast(rgb(255, 255, 255, alpha).formatRgb(), background),
        )
        const color = rgb(64, 32, 96, alpha).formatRgb()
        const adjusted = improveColorContrast(color, background, 4.5)
        expect(rgb(adjusted).opacity).toBe(alpha)
        expect(contrast(adjusted, background)).toBeGreaterThanOrEqual(Math.min(4.5, maximum))
      }
    }
  })

  test('retains transparency and chooses the best attainable contrast when alpha limits it', () => {
    const color = 'rgba(32, 16, 16, 0.7)'
    const adjusted = improveColorContrast(color, '#182026', 4.5)
    expect(rgb(adjusted).opacity).toBe(0.7)
    expect(contrast(adjusted, '#182026')).toBeGreaterThanOrEqual(4.5)
    const faint = improveColorContrast('rgba(200, 220, 255, 0.1)', '#fff', 4.5)
    expect(rgb(faint).opacity).toBe(0.1)
    expect(contrast(faint, '#fff')).toBeCloseTo(contrast('rgba(0, 0, 0, 0.1)', '#fff'))
    expect(improveColorContrast('transparent', '#fff', 4.5)).toBe('transparent')
  })

  test('is opt-in and preserves non-color SVG paints', () => {
    for (const color of ['#222', 'var(--series-color)', 'currentColor', 'url(#gradient)', 'none']) {
      expect(resolveMarkColor(color, { ...theme, colorContrast: 'none' })).toBe(color)
    }
    for (const color of ['none', 'context-fill', 'context-stroke', 'url(#gradient)']) {
      expect(resolveMarkColor(color, theme)).toBe(color)
    }
  })

  test('uses distinct thresholds and backgrounds for marks and label text', () => {
    const mark = resolveMarkColor('#222', theme)
    const label = resolveMarkColor('#222', theme, 'text', theme.tooltipBackground)
    expect(contrast(mark, theme.background)).toBeGreaterThanOrEqual(3)
    expect(contrast(mark, theme.background)).toBeLessThan(3.12)
    expect(contrast(label, theme.tooltipBackground)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(label, theme.tooltipBackground)).toBeLessThan(4.62)
    expect(resolveMarkColor('currentColor', theme)).toBe(theme.foreground)
    expect(tooltipColorTheme(theme).background).toBe(theme.tooltipBackground)
    expect(tooltipColorTheme(theme)).toBe(tooltipColorTheme(theme))
  })

  test('shares corrected styles across lines, markers and composite fills without mutating input', () => {
    const mark = {
      stroke: '#222',
      strokeWidth: 1,
      markers: {
        fill: '#111',
        stroke: '#333',
        strokeWidth: 1,
        size: 12,
        symbol: 'circle' as const,
        render: 'default' as const,
        skip: 1,
      },
      area: { fill: '#222', opacity: 0.2, to: 0 },
    }
    const original = structuredClone(mark)
    const styles = resolveLineStyles(mark, theme)
    expect(styles.line.stroke).toBe(resolveMarkColor('#222', theme))
    expect(styles.marker.fill).toBe(resolveMarkColor('#111', theme))
    expect(styles.marker.stroke).toBe(resolveMarkColor('#333', theme))
    expect(styles.area.fill).toBe(styles.line.stroke)
    expect(styles.area.opacity).toBe(0.2)
    expect(mark).toEqual(original)
    const unchanged = resolveLineStyles(mark, { ...theme, colorContrast: 'none' })
    expect(unchanged.line.stroke).toBe(mark.stroke)
    expect(unchanged.marker.fill).toBe(mark.markers.fill)
    expect(unchanged.marker.stroke).toBe(mark.markers.stroke)
    expect(unchanged.area.fill).toBe(mark.area.fill)
    const composite = resolveCompositeStyle(
      { fill: '#222', stroke: '#111', opacity: 0.25 },
      {},
      theme,
    )
    expect(composite.fill).toBe(styles.line.stroke)
    expect(composite.stroke).toBe(styles.marker.fill)
    expect(composite.opacity).toBe(0.25)
    expect(resolveCompositeStyle({}, {}, { ...theme, colorContrast: 'none' }).fill).toBe(
      'var(--fews-chart-accent, #66c2ff)',
    )
  })

  test('reports unsupported colors, translucent backgrounds and invalid thresholds', () => {
    expect(() => improveColorContrast('invalid', '#fff', 3)).toThrow('Cannot adjust contrast')
    expect(() => improveColorContrast('#000', 'invalid', 3)).toThrow('Cannot adjust contrast')
    expect(() => improveColorContrast('#000', 'transparent', 3)).toThrow('opaque theme background')
    for (const target of [0, 22, NaN, Infinity]) {
      expect(() => improveColorContrast('#000', '#fff', target)).toThrow('between 1 and 21')
    }
  })
})
