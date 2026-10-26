import { registerContrastTheme, type ColorContrast } from './color-contrast.js'

export type ThemeMode = 'auto' | 'light' | 'dark'
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
  const fontSizeToken = token('font-size', String(defaults.fontSize))
  const fontSize = Number.parseFloat(fontSizeToken)
  if (
    !/^(?:\d+(?:\.\d+)?|\.\d+)(?:px)?$/.test(fontSizeToken) ||
    !Number.isFinite(fontSize) ||
    fontSize <= 0
  ) {
    throw new Error('--fews-chart-font-size must be a positive pixel size.')
  }
  const tokens: ThemeTokens = Object.freeze({
    colorContrast,
    background: token('background', defaults.background),
    foreground: token('foreground', defaults.foreground),
    grid: token('grid', defaults.grid),
    accent: token('accent', defaults.accent),
    tooltipBackground: token('tooltip-background', defaults.tooltipBackground),
    tooltipColor: token('tooltip-color', defaults.tooltipColor),
    fontFamily: token('font-family', defaults.fontFamily),
    fontSize,
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
