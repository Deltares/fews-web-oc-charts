import { rgb, type RGBColor } from 'd3-color'
import type { ThemeTokens } from './theme.js'

export type ColorContrast = 'none' | 'auto'

type Channels = readonly [number, number, number]
const contexts = new WeakMap<ThemeTokens, Element>()
const caches = new WeakMap<ThemeTokens, Map<string, string>>()
const tooltipThemes = new WeakMap<ThemeTokens, ThemeTokens>()

export function registerContrastTheme(tokens: ThemeTokens, element: Element) {
  contexts.set(tokens, element)
}

export function tooltipColorTheme(tokens: ThemeTokens): ThemeTokens {
  if (tokens.colorContrast !== 'auto') return tokens
  let theme = tooltipThemes.get(tokens)
  if (!theme) {
    theme = Object.freeze({ ...tokens, background: tokens.tooltipBackground })
    const element = contexts.get(tokens)
    if (element) contexts.set(theme, element)
    tooltipThemes.set(tokens, theme)
  }
  return theme
}

function linear(value: number) {
  value /= 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function luminance(color: Channels) {
  return 0.2126 * linear(color[0]) + 0.7152 * linear(color[1]) + 0.0722 * linear(color[2])
}

function contrast(color: Channels, background: Channels, alpha: number) {
  const blended = color.map((channel, i) => channel * alpha + background[i] * (1 - alpha))
  const first = luminance([blended[0], blended[1], blended[2]])
  const second = luminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

function parseColor(value: string): RGBColor {
  const color = rgb(value)
  if (![color.r, color.g, color.b].every(Number.isFinite) && color.opacity !== 0) {
    throw new Error(`Cannot adjust contrast for color "${value}".`)
  }
  return color
}

function oklab(color: Channels): Channels {
  const [r, g, b] = color.map(linear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function fromOklab(lightness: number, a: number, b: number): Channels {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

function inGamut(color: Channels) {
  return color.every((channel) => channel >= -1e-7 && channel <= 1 + 1e-7)
}

function gamutMap(lightness: number, a: number, b: number): Channels {
  let color = fromOklab(lightness, a, b)
  if (!inGamut(color)) {
    let low = 0
    let high = 1
    // Scaling a and b together reduces OKLCH chroma without rotating the hue.
    for (let i = 0; i < 24; i++) {
      const scale = (low + high) / 2
      if (inGamut(fromOklab(lightness, a * scale, b * scale))) low = scale
      else high = scale
    }
    color = fromOklab(lightness, a * low, b * low)
  }
  const encode = (value: number) =>
    Math.round(255 * (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055))
  return [encode(color[0]), encode(color[1]), encode(color[2])]
}

/** Adjusts lightness in OKLCH, reducing chroma only to stay within sRGB. */
export function improveColorContrast(color: string, background: string, minimum: number): string {
  if (!Number.isFinite(minimum) || minimum < 1 || minimum > 21) {
    throw new RangeError('Minimum color contrast must be between 1 and 21.')
  }
  const source = parseColor(color).clamp()
  if (source.opacity === 0) return color
  const backdrop = parseColor(background).clamp()
  if (backdrop.opacity !== 1) {
    throw new Error('Automatic color contrast requires an opaque theme background.')
  }
  const channels: Channels = [source.r, source.g, source.b]
  const back: Channels = [backdrop.r, backdrop.g, backdrop.b]
  if (contrast(channels, back, source.opacity) >= minimum) return color
  const [lightness, a, b] = oklab(channels)
  const candidates = [0, 1].map((end) => {
    let passing = end
    let failing = lightness
    let result = gamutMap(end, a, b)
    if (contrast(result, back, source.opacity) >= minimum) {
      for (let i = 0; i < 28; i++) {
        const middle = (passing + failing) / 2
        const next = gamutMap(middle, a, b)
        if (contrast(next, back, source.opacity) >= minimum) {
          passing = middle
          result = next
        } else failing = middle
      }
    }
    return { result, lightness: passing, ratio: contrast(result, back, source.opacity) }
  })
  candidates.sort((left, right) => {
    if (left.ratio >= minimum && right.ratio >= minimum) {
      return Math.abs(left.lightness - lightness) - Math.abs(right.lightness - lightness)
    }
    return right.ratio - left.ratio
  })
  const [r, g, blue] = candidates[0].result
  return rgb(r, g, blue, source.opacity).formatRgb()
}

function resolvedColor(value: string, tokens: ThemeTokens): string {
  if (
    value.toLowerCase() === 'currentcolor' &&
    tokens.foreground.toLowerCase() !== 'currentcolor'
  ) {
    return resolvedColor(tokens.foreground, tokens)
  }
  const parsed = rgb(value)
  if ([parsed.r, parsed.g, parsed.b].every(Number.isFinite) || parsed.opacity === 0) return value
  const element = contexts.get(tokens)
  if (!element) throw new Error(`Cannot resolve theme color "${value}" without a plot host.`)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const probe = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  probe.style.fill = value
  if (!probe.style.fill) throw new Error(`Cannot adjust contrast for color "${value}".`)
  svg.style.color = tokens.foreground
  svg.style.display = 'none'
  svg.append(probe)
  element.append(svg)
  try {
    const computed = getComputedStyle(probe).fill
    const color = rgb(computed)
    if ([color.r, color.g, color.b].every(Number.isFinite) || color.opacity === 0) return computed
    // Canvas converts modern CSS colors (including OKLCH) to sRGB.
    const context = document.createElement('canvas').getContext('2d')
    if (!context) throw new Error('Automatic color contrast requires a 2D rendering context.')
    context.fillStyle = computed
    context.fillRect(0, 0, 1, 1)
    const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data
    return rgb(r, g, b, alpha / 255).formatRgb()
  } finally {
    svg.remove()
  }
}

export function resolveMarkColor(
  color: string,
  tokens: ThemeTokens,
  role: 'mark' | 'text' = 'mark',
  background = tokens.background,
): string {
  if (
    tokens.colorContrast !== 'auto' ||
    /^(?:none|context-fill|context-stroke)$|^url\(/i.test(color.trim())
  ) {
    return color
  }
  let cache = caches.get(tokens)
  if (!cache) {
    cache = new Map()
    caches.set(tokens, cache)
  }
  const key = JSON.stringify([color, role, background])
  let result = cache.get(key)
  if (result === undefined) {
    result = improveColorContrast(
      resolvedColor(color, tokens),
      resolvedColor(background, tokens),
      role === 'text' ? 4.5 : 3,
    )
    cache.set(key, result)
  }
  return result
}
