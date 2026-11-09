import { registerContrastTheme, type ColorContrast } from './color-contrast.js'

export type ThemeMode = 'auto' | 'light' | 'dark'

/** Text roles with their own font tokens; each falls back to the base font tokens. */
export type FontRole = 'tick' | 'axisLabel' | 'title' | 'legend' | 'tooltip'

export interface FontTokens {
  /** A font-family list usable in CSS and canvas fonts, never `inherit` or `var()`. */
  readonly family: string
  /** Size in CSS pixels. */
  readonly size: number
  readonly weight: string
  /** CSS `font-variant-numeric`, e.g. `tabular-nums` so digits line up. */
  readonly variantNumeric: string
}

export interface ThemeTokens {
  readonly colorContrast?: ColorContrast
  readonly background: string
  readonly foreground: string
  readonly grid: string
  readonly accent: string
  readonly tooltipBackground: string
  readonly tooltipColor: string
  readonly fontFamily: string
  readonly fontSize: number
  /** Fonts per text role, resolved from `--fews-chart-<role>-font-*` and the base tokens. */
  readonly fonts: Readonly<Record<FontRole, FontTokens>>
}

const fontRoles: Readonly<Record<FontRole, string>> = {
  tick: 'tick',
  axisLabel: 'axis-label',
  title: 'title',
  legend: 'legend',
  tooltip: 'tooltip',
}

export function roleFonts(base: FontTokens): Readonly<Record<FontRole, FontTokens>> {
  const fonts = Object.fromEntries(Object.keys(fontRoles).map((role) => [role, base]))
  return Object.freeze(fonts) as Record<FontRole, FontTokens>
}

const cssWideKeywords = /^(?:inherit|initial|unset|revert|revert-layer)$/i

function parseFontSize(value: string, name: string) {
  const size = Number.parseFloat(value)
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)(?:px)?$/.test(value) || !Number.isFinite(size) || size <= 0) {
    throw new Error(`--fews-chart-${name} must be a positive pixel size.`)
  }
  return size
}

function parseFontWeight(value: string, name: string) {
  const numeric = Number(value)
  const keyword = /^(?:normal|bold|bolder|lighter)$/i.test(value)
  if (!keyword && !(Number.isFinite(numeric) && numeric >= 1 && numeric <= 1000)) {
    throw new Error(`--fews-chart-${name} must be normal, bold, bolder, lighter or 1-1000.`)
  }
  return value
}

function parseVariantNumeric(value: string, name: string) {
  if (typeof CSS !== 'undefined' && !CSS.supports('font-variant-numeric', value)) {
    throw new Error(`--fews-chart-${name} must be a valid font-variant-numeric value.`)
  }
  return value
}

/**
 * Resolves the base font and the font of every role. Font families fall back to the
 * host's computed `font-family`, so a chart uses the page font without any tokens.
 */
function resolveFonts(style: CSSStyleDeclaration, defaults: ThemeTokens) {
  const token = (name: string) => {
    const value = style.getPropertyValue(`--fews-chart-${name}`).trim()
    return cssWideKeywords.test(value) ? '' : value
  }
  const font = (prefix: string, fallback: FontTokens): FontTokens => {
    const size = token(`${prefix}font-size`)
    const weight = token(`${prefix}font-weight`)
    const variant = token(`${prefix}font-variant-numeric`)
    return Object.freeze({
      family: token(`${prefix}font-family`) || fallback.family,
      size: size ? parseFontSize(size, `${prefix}font-size`) : fallback.size,
      weight: weight ? parseFontWeight(weight, `${prefix}font-weight`) : fallback.weight,
      variantNumeric: variant
        ? parseVariantNumeric(variant, `${prefix}font-variant-numeric`)
        : fallback.variantNumeric,
    })
  }
  const hostFamily = cssWideKeywords.test(style.fontFamily) ? '' : style.fontFamily.trim()
  const base = font('', {
    family: hostFamily || defaults.fontFamily,
    size: defaults.fontSize,
    weight: 'normal',
    variantNumeric: 'normal',
  })
  const fonts = Object.fromEntries(
    Object.entries(fontRoles).map(([role, prefix]) => [role, font(`${prefix}-`, base)]),
  ) as Record<FontRole, FontTokens>
  return { base, fonts: Object.freeze(fonts) }
}

/** Canvas `font` shorthand for measuring text in this font. */
export function canvasFont(font: FontTokens, weight = font.weight) {
  return `${weight} ${font.size}px ${font.family}`
}

/** Applies a role font to SVG text (as presentation attributes) or an HTML element. */
export function applyFont(element: SVGElement | HTMLElement, font: FontTokens) {
  if (element instanceof SVGElement) {
    element.setAttribute('font-family', font.family)
    element.setAttribute('font-size', String(font.size))
    element.setAttribute('font-weight', font.weight)
  } else {
    element.style.fontFamily = font.family
    element.style.fontSize = `${font.size}px`
    element.style.fontWeight = font.weight
  }
  element.style.fontVariantNumeric = font.variantNumeric
}

const light: ThemeTokens = {
  colorContrast: 'none',
  background: '#ffffff',
  foreground: '#263238',
  grid: '#dce2e5',
  accent: '#0077bb',
  tooltipBackground: '#fff',
  tooltipColor: '#222',
  fontFamily: 'sans-serif',
  fontSize: 12,
  fonts: roleFonts({ family: 'sans-serif', size: 12, weight: 'normal', variantNumeric: 'normal' }),
}
const dark: ThemeTokens = {
  ...light,
  background: '#182026',
  foreground: '#edf2f4',
  grid: '#45545e',
  accent: '#66c2ff',
  tooltipBackground: '#000',
  tooltipColor: '#edf2f4',
}

export function resolveTheme(
  element: Element,
  mode: ThemeMode,
  prefersDark: boolean,
  colorContrast: ColorContrast = 'none',
): ThemeTokens {
  const defaults = mode === 'dark' || (mode === 'auto' && prefersDark) ? dark : light
  const style = getComputedStyle(element)
  const token = (name: string, fallback: string) =>
    style.getPropertyValue(`--fews-chart-${name}`).trim() || fallback
  const { base, fonts } = resolveFonts(style, defaults)
  const tokens: ThemeTokens = Object.freeze({
    colorContrast,
    background: token('background', defaults.background),
    foreground: token('foreground', defaults.foreground),
    grid: token('grid', defaults.grid),
    accent: token('accent', defaults.accent),
    tooltipBackground: token('tooltip-background', defaults.tooltipBackground),
    tooltipColor: token('tooltip-color', defaults.tooltipColor),
    fontFamily: base.family,
    fontSize: base.size,
    fonts,
  })
  registerContrastTheme(tokens, element)
  return tokens
}

export function watchTheme(observedElement: Element | undefined, changed: () => void): () => void {
  const media = matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', changed)
  const observer = observedElement ? new MutationObserver(changed) : undefined
  if (observedElement) {
    observer?.observe(observedElement, { attributes: true, attributeFilter: ['class', 'style'] })
  }
  return () => {
    media.removeEventListener('change', changed)
    observer?.disconnect()
  }
}
