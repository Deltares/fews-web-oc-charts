import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import {
  createPlot,
  createSeries,
  crosshair,
  handleCache,
  highlight,
  line,
  linearScale,
  series,
  tooltip,
  type LineMark,
  type Plot,
  type PlotConfig,
} from '../../src/index.js'

const plots: Plot[] = []
const hosts: HTMLElement[] = []

function host() {
  const element = document.createElement('div')
  element.style.width = '500px'
  element.style.height = '300px'
  document.body.append(element)
  hosts.push(element)
  return element
}

function plot(config: PlotConfig) {
  const result = createPlot(host(), config)
  plots.push(result)
  return result
}

async function frame() {
  await new Promise(requestAnimationFrame)
  await new Promise(requestAnimationFrame)
}

function member(id: string, value: number) {
  return line({ id, x: 't', y: 'q', xValues: [0, 10], yValues: [value, value + 1] })
}

afterEach(() => {
  for (const current of plots.splice(0)) current.destroy()
  for (const element of hosts.splice(0)) element.remove()
  vi.restoreAllMocks()
})

describe('handleCache with installed handles', () => {
  function inspectedPlot() {
    const handles = handleCache()
    const config = (marks: readonly LineMark[]) =>
      handles.collect(() => {
        const guide = handles.use('crosshair', crosshair, {
          snap: { mark: marks[0], axis: 'x' },
        })
        return {
          scales: {
            t: handles.use('t', linearScale, { domain: [0, 10] }),
            q: handles.use('q', linearScale, { domain: [0, 10] }),
          },
          directions: { t: 'x', q: 'y' },
          marks,
          plugins: [
            guide,
            handles.use('highlight', highlight, { marks, crosshair: guide }),
            handles.use('tooltip', tooltip, { marks, crosshair: guide }),
          ],
        } satisfies PlotConfig
      })
    return { handles, config }
  }

  test('checks updated mark and plugin references against the next configuration', async () => {
    const reported = vi.spyOn(globalThis, 'reportError').mockImplementation(() => {})
    const { config } = inspectedPlot()
    const current = plot(config([member('a', 1), member('b', 2)]))
    await frame()
    const highlightHandle = current.options.get().resolved.plugins[1]

    const next = [member('c', 3), member('d', 4)]
    current.setConfig(config(next))
    await frame()

    const resolved = current.options.get().resolved
    expect(resolved.plugins[1]).toBe(highlightHandle)
    expect(resolved.marks).toEqual(next)
    expect((highlightHandle as ReturnType<typeof highlight>).options.get().resolved.marks).toEqual(
      next,
    )
    expect(reported).not.toHaveBeenCalled()
  })

  test('reports an update that the plot never received', async () => {
    const reported = vi.spyOn(globalThis, 'reportError').mockImplementation(() => {})
    const { config } = inspectedPlot()
    const current = plot(config([member('a', 1)]))
    await frame()
    config([member('b', 2)])
    await Promise.resolve()
    expect(reported).toHaveBeenCalled()
    expect(reported.mock.calls.map(([error]) => (error as Error).message)).toContain(
      'highlight.marks must be included in plot.marks.',
    )
    expect(current.destroyed).toBe(false)
  })

  test('does not report handles that the next configuration removes', async () => {
    const reported = vi.spyOn(globalThis, 'reportError').mockImplementation(() => {})
    const { config } = inspectedPlot()
    const current = plot(config([member('a', 1)]))
    await frame()
    const next = config([member('b', 2)])
    current.setConfig({ ...next, plugins: [] })
    await frame()
    expect(reported).not.toHaveBeenCalled()
  })

  test('moves a cached series to a scale added in the same configuration', async () => {
    const reported = vi.spyOn(globalThis, 'reportError').mockImplementation(() => {})
    const handles = handleCache()
    const data = createSeries({ x: [0, 10], y: [1, 2] })
    const config = (scale: string): PlotConfig =>
      handles.collect(() => ({
        scales: {
          t: handles.use('t', linearScale, { domain: [0, 10] }),
          [scale]: handles.use(`scale:${scale}`, linearScale, { domain: [0, 10] }),
        },
        directions: { t: 'x', [scale]: 'y' },
        marks: [handles.use('series', series, data, { id: 'flow', x: 't', y: scale })],
      }))
    const current = plot(config('q'))
    await frame()
    const mark = current.options.get().resolved.marks[0]
    current.setConfig(config('level'))
    await frame()
    expect(current.options.get().resolved.marks[0]).toBe(mark)
    expect(Object.keys(current.scales)).toEqual(['t', 'level'])
    expect(reported).not.toHaveBeenCalled()
  })

  test('direct updates are still checked against the current plot', async () => {
    const { config } = inspectedPlot()
    const current = plot(config([member('a', 1)]))
    await frame()
    const highlightHandle = current.options.get().resolved.plugins[1] as ReturnType<
      typeof highlight
    >
    expect(() => highlightHandle.update({ marks: [member('b', 2)] })).toThrow(
      'highlight.marks must be included in plot.marks.',
    )
  })
})
