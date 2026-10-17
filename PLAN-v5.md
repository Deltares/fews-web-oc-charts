# Plan: FEWS Web OC Charts v5

## 0. Decisions taken

| Topic                  | Decision                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Package                | Keep `@deltares/fews-web-oc-charts`, release as **major v5**                                                                     |
| Default renderer       | **SVG**; canvas is an explicit opt-in per mark or plot-wide. **No `auto` renderer** for now                                      |
| Time handling          | **Remove `luxon`**; use `Intl.DateTimeFormat` + `d3-time` (see 3.3.1)                                                            |
| Reactivity             | **Own reactive core** (no external signals library)                                                                              |
| Distribution           | Core ESM API **plus an HTML5 Web Component** (`<fews-chart>`, see 3.13)                                                          |
| Web Component          | Tag prefix **`fews-`**; v5.0 configured via **`el.config` property only** (no child config elements)                             |
| v4 compatibility layer | **Full v4 public API**, delivered in the **last phase** of the roadmap (see 3.14)                                                |
| Browser support        | **Baseline Widely Available** (moving target; at time of writing ≈ Chrome/Edge 124, Firefox 125, Safari/iOS 17.4). No polyfills. |

## 1. Analysis of the current library (v4.7)

| Area           | Current situation                                                                                                                                                                                     | Consequence                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Redraw         | `CartesianAxes.zoom()` calls `plotter()` on **every** chart and `redraw()` on **every** visitor; `resize`, theme change, legend toggle all trigger full redraws                                       | Cost scales with total content, not with what changed                           |
| Theme          | `MutationObserver` on `<html>` class → full `redraw()`                                                                                                                                                | Any unrelated class change redraws everything                                   |
| Data           | `DataPoint[]` = array of objects `{x: Date, y: number}`; `mapDataCartesian` slices a copy per render; extent recomputed per key                                                                       | ~50–80 bytes/point + `Date` objects, GC pressure, slow for long/ensemble series |
| Styling        | `getComputedStyle()` called in pointer-move & legend paths                                                                                                                                            | Forced style recalcs on hover                                                   |
| Ensembles      | One `Chart` per member; percentiles computed by the app                                                                                                                                               | N DOM groups, N tooltips, N extents                                             |
| Line + markers | `ChartLine` + `ChartMarker` as two series with the same data                                                                                                                                          | Doubles data, legend entries, hit-tests                                         |
| Axes           | `x[0..1]`, `y[0..1]` indices hard-coded (`0 \| 1`)                                                                                                                                                    | Max 2 axes per direction, index-based coupling                                  |
| Sync           | `ZoomHandler` holds an array of axes; `addEventListener('update:x-domain')` only for x                                                                                                                | Ad-hoc, x-only, easy to create feedback loops                                   |
| Architecture   | `Chart` does data, extent, styling, tooltip, highlight, legend symbol, cartesian **and** polar plotting (`instanceof` dispatch, circular imports via `index.js`); options mutated with lodash `merge` | Hard to extend, test, tree-shake                                                |
| Lifecycle      | `ResizeObserver`/`MutationObserver` are never disconnected; no `destroy()`                                                                                                                            | Leaks in SPA (Vue) usage                                                        |
| Globals        | `d3.formatDefaultLocale(...)` set in every `Axes` constructor                                                                                                                                         | Side effect on host application                                                 |
| Live data      | Replace `chart.data` and call `redraw()`                                                                                                                                                              | Full recompute & redraw for every append                                        |

Functional surface that must be preserved: cartesian & polar coordinate systems; marks
line, marker, area, range, bar, histogram, arrow, direction, matrix, progress, rule, text;
colour bar; time/value/band/degrees axes, time zones & locales, nice/includeZero/symmetric/
defaultDomain/reverse, automargin, secondary axes; interactions zoom (brush + wheel),
pan, brush select, mouse-over/crosshair, tooltip; overlays current time, DST indicator,
warning levels, alert lines, level select, cross-section select, data field, Beaufort axis,
legend; domain-change events.

## 2. Goals & design principles

1. **Invalidate, don't redraw** – every piece of state is tracked; a change marks only
   dependent layers dirty; one `requestAnimationFrame` flush per frame.
2. **Columnar data** – typed arrays, shared time columns, no per-point objects.
3. **Composition over inheritance** – plain functions & objects, small modules, no
   `instanceof`, tree-shakable ESM, no lodash.
4. **Named, shareable state** – scales, pointer and selection are first-class objects that
   can be shared between plots → synchronisation is free.
5. **d3 for the math, not the scheduling** – keep `d3-scale`, `d3-shape`, `d3-axis`,
   `d3-zoom`, `d3-brush`, `d3-time-format`, `d3-array`, `d3-quadtree/d3-delaunay`, but
   import sub-packages only.
6. **Explicit lifecycle** – `plot.destroy()` releases observers, listeners, buffers.

## 3. Architecture

```
┌───────────────────────── Public API (functional) ─────────────────────────┐
│ createPlot · createPolarPlot · marks · scales · axes · plugins · sync     │
├──────────────┬──────────────┬──────────────┬──────────────┬───────────────┤
│ Data store   │ Reactive core│ Layout engine│ Renderers    │ Interaction   │
│ (columnar,   │ (signals +   │ (measure →   │ (SVG / Canvas│ (pointer hub, │
│  ring buffer,│  dirty flags,│  margins →   │  per layer)  │  hit-testing, │
│  LOD index)  │  rAF batch)  │  regions)    │              │  gestures)    │
├──────────────┴──────────────┴──────────────┴──────────────┴───────────────┤
│ Coordinate systems: cartesian(project x,y) | polar(project θ,r)            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Reactive core (`core/`) – own implementation

- Own signal primitive (~200 LOC, zero dependencies, fully owned & tested):
  - `signal<T>(value, { equals })` – read/write cell with custom equality
    (e.g. domain compare by value, not by array identity).
  - `computed<T>(fn)` – lazy, cached, auto-tracked dependencies, version counter.
  - `effect(fn)` → `dispose()`; effects run **through the scheduler**, never synchronously.
  - `batch(fn)` / `untracked(fn)`.
  - Push-dirty / pull-evaluate (coloured graph: clean / check / dirty) → glitch-free,
    each computed evaluated at most once per flush.
  - Ownership scopes (`createScope()`): every plot/plugin owns a scope; `scope.dispose()`
    tears down all effects → basis for leak-free `destroy()`.
  - Dev-mode diagnostics: cycle detection, effect run counters (feeds the redraw overlay).
- Interop: tiny adapters `toVueRef(signal)` / `fromVueRef(ref)` in the Vue adapter so the
  core stays framework-free.
- State signals: `size`, `margins`, per-scale `domain`/`range`, per-series `version`,
  `theme`, `pointer`, `selection`, mark `visible`/`style`.
- **Scheduler**: effects don't render directly; they set dirty bits on layers
  (`LAYOUT | AXES | GRID | MARKS(id) | OVERLAY | INTERACTION`) and schedule one rAF.
- Dependency precision examples:
  - y2 domain change → only marks bound to y2 + y2 axis/grid.
  - pointer move → only overlay layer (crosshair, highlight, tooltip); never data layers.
  - legend toggle → one mark's visibility + autoscale of its scales (if enabled).
  - theme change → style token cache refresh; canvas layers repaint, SVG via CSS vars only.

### 3.2 Data store (`data/`)

- `createSeries({ x, y, … })` / `createTable(columns)`:
  - x stored as `Float64Array` (epoch ms for time), y as `Float64Array`/`Float32Array`
    (opt-in precision), missing = `NaN`.
  - **Ensemble** = `createEnsemble({ x, members: Float32Array[] | matrix })`: one shared
    x column, member matrix (row-major `members × time`), optional member metadata.
- Growable **ring buffer** with `capacity`, `maxPoints`, `maxAge` retention.
- **Block min/max index** (e.g. 256-sample blocks, segment tree) → O(log n) extent for any
  x-window and fast autoscale while zoomed/panned.
- **LOD / decimation**: M4 / min-max-per-pixel-column decimation on render, cached per
  (domain, pixel width, version). 1M points → ~4×width vertices.
- Derived columns are lazy & cached by version: ensemble quantiles (per time step, using
  `d3.quantileSorted` on a reused scratch buffer), mean, median, min/max envelope,
  exceedance probability for warning thresholds.
- Adapters: `fromObjects(array, { x: 't', y: 'value' })`, `fromFewsPiTimeSeries(json)`
  (flag/comment columns preserved), and accepting the v4 `DataPoint[]` for migration.
- Mutations: `append`, `prepend`, `upsert(range)`, `replace`, `clear`; each bumps
  `version` and reports the affected x-range so renderers can patch incrementally.

### 3.3 Scales & axes (`scales/`, `axes/`)

- Named scales, unlimited count:
  ```ts
  scales: { t: time({ timeZone: 'Europe/Amsterdam' }),
            q: linear({ nice: true, includeZero: true }),
            h: linear({ reverse: true }), dir: degrees() }
  ```
- Scale = `{ domain signal, range signal, d3 scale (derived), options, autoscale policy }`.
- Autoscale policy per scale: `'data' | 'visible' (extent within other-axis window) |
'fixed' | fn`, plus `nice`, `includeZero`, `symmetric`, `defaultDomain`, `padding`.
- Axes are views on scales: `axis('q', { position: 'left', label, unit, grid, format,
tickCount, labelAngle })`. Multiple axes on the same side stack automatically.
- Time axis: `Intl`-based multi-level ticks (e.g. hour row + day row), locale/timezone per
  axis, no global `d3.formatDefaultLocale` (number formatting via `d3.formatLocale`
  instance per plot).
- Polar: `angular(...)` & `radial(...)` scales with direction/intercept/range; Beaufort and
  colour bar become axis variants.

#### 3.3.1 Replacing luxon (`time/`)

Luxon is currently used for: zone offsets in time-tick generation (`Axis.updateTicksForTime`,
`PolarAxes`), multi-level tick formatting (`generateMultiFormat`), `dateFormatter` with
format tokens, and DST transition search (`DstIndicator`). Replacement:

- `zoneOffset(tz, epochMs)`: offset via cached `Intl.DateTimeFormat(…, { timeZone,
hourCycle: 'h23', year…second })` + `formatToParts`; memoised per (tz, hour bucket).
  Fast path for `UTC` and fixed-offset zones (`Etc/GMT±n`, `+01:00`).
- `zonedTicks(scale, tz, count)`: shift domain by offset → `d3.utcTicks` → shift back
  (same algorithm as today), with correct handling around DST gaps/overlaps.
- `zonedInterval(d3Interval, tz)`: floor/ceil/offset in a zone for day/week/month
  boundaries (used by ticks, grid, DST indicator, `follow` windows).
- Formatting: cached `Intl.DateTimeFormat` instances keyed by (locale, tz, options);
  multi-format picks an option set (`{hour, minute}`, `{weekday, day}`, `{month, day}`,
  `{month: 'long'}`, `{year}`) instead of luxon format strings. Custom formats via
  a small token formatter built on `formatToParts` (`yyyy-MM-dd HH:mm` etc.) for
  backwards-compatible `dateFormatter`.
- `findTransitions(tz, start, end)`: detect offset change per day then binary search to
  the minute → DST indicator.
- Durations (`'48h'`, `'P3D'`, ms) parsed by a tiny helper for `follow` windows.
- Future: switch internals to `Temporal` when broadly available, same public API.
- Test matrix: Europe/Amsterdam, America/Mexico_City (DST abolished 2022),
  Australia/Lord_Howe (30 min DST), Asia/Kolkata (+5:30), UTC; compare against v4 output.

### 3.4 Layout engine (`layout/`)

- Pure function `layout(size, axes, legend, title) → regions` (plot area, axis bands,
  legend box). Text measurement via cached `OffscreenCanvas.measureText` → **automargin
  without the current "draw, measure, redraw" loop**.
- Stable margins (hysteresis) so tick-label width changes during pan don't cause jitter.
- Fully unit-testable in Node.

### 3.5 Renderers (`render/`)

- Layer stack (each with own dirty flag): background · grid · marks (back) · marks ·
  annotations (thresholds, current time) · axes · overlay (crosshair, highlight, brush) ·
  interaction (event surface) · HTML (tooltip, legend).
- **SVG is the default renderer** (crisp output, CSS styling, easy export, DOM-testable).
  Canvas is an explicit opt-in: `renderer: 'canvas'` per mark, or a plot-wide default.
  No automatic switching (`'auto'`) for now – keeps output predictable; may be revisited
  once benchmarks exist. Both use the same d3 generators (`d3.line().context(ctx)` for
  canvas). With LOD decimation SVG stays fast up to ~1M source points per series.
- SVG: one `<path>` per series/stroke, keyed joins only for discrete marks (bars, text);
  `vector-effect: non-scaling-stroke`.
- **Gesture fast path**: during pan/zoom apply a transform to cached layers
  (CSS/SVG transform or canvas `drawImage`) and do the full LOD re-render throttled /
  at gesture end.
- Canvas: devicePixelRatio aware, `Path2D` caching per (mark, LOD key).
- Optional later: WebGL renderer for >10M points behind the same mark interface.
- Export: `plot.toSVG()`, `plot.toPNG()` (canvas layers inlined as images).

### 3.6 Marks (`marks/`) – one unified series mark

```ts
series(data, {
  x: 't',
  y: 'q',
  scales: { x: 't', y: 'q' },
  line: { stroke: 'var(--fews-obs)', width: 1.5, curve: 'stepAfter', dash: [4, 2] },
  markers: { symbol: 'circle', size: 4, every: 1 | 'auto', fill: 'auto' },
  area: { to: 0 | 'y0Column', fill: '…', opacity: 0.2 },
  label: 'Observed',
  tooltip: true,
  hitTest: 'x' | 'xy',
})
```

Line + markers + area in **one** mark (one data reference, one legend entry, one hit-test).
Other marks: `band` (range / min-max), `bar` (incl. stacked/grouped, step bars),
`histogram`, `arrows`/`direction` (wind/current), `heatmap` (matrix, time×level),
`progress`, `rule` (horizontal/vertical), `text`, `thresholds` (warning levels as a mark),
`colorBar`. Each mark implements:

```ts
interface Mark {
  id: string
  scales: string[]                       // dependencies → precise invalidation
  extent(scale, window?): [min,max]      // uses block index
  render(ctx: RenderContext): void       // ctx = coordinate system + renderer + LOD
  hitTest(px, py | x): Hit | undefined
  legendSymbol(): SymbolSpec             // declarative, no getComputedStyle
}
```

Marks never know if they are in cartesian or polar coordinates; they call `ctx.project()`.

### 3.7 Ensembles (first-class)

```ts
ensemble(fc, {
  x: 't',
  scales: { x: 't', y: 'q' },
  show: {
    members: { opacity: 0.25, max: 50 }, // SVG default; renderer: 'canvas' for large sets
    spread: [
      [5, 95],
      [25, 75],
    ], // quantile bands, nested
    median: { stroke: 'black' },
    mean: false,
    control: { member: 0, stroke: 'red' },
  },
  highlightOnHover: true, // nearest member at pointer
  exceedance: { threshold: 'alarm', show: 'tooltip' },
})
```

- Members drawn in SVG as one `<path>` per member inside one group (decimated); for
  large ensembles opt into a single canvas layer (one draw call per member).
- Tooltip shows quantiles at pointer time, optional nearest member id.
- Legend: one entry with sub-items (members / spread / median), toggles individually.
- Memory: 50 members × 10k steps ≈ 2 MB Float32 vs. ~40 MB with object arrays.

### 3.8 Interaction & plugins (`plugins/`)

- Single **pointer hub** per plot (one listener set, rAF-coalesced, touch/pen aware) that
  publishes a `pointer` signal `{ px, py, x: Map<scale, value>, inside }`.
- Plugin interface:
  ```ts
  type Plugin = (ctx: PlotContext) => { update?(dirty: DirtyFlags): void; destroy(): void }
  ```
- Ported plugins: `zoom({ mode: 'x'|'y'|'xy', wheel, modifier, reset: 'initial'|'full'|'toggle' })`,
  `pan`, `brush` (select range → event), `crosshair` (former MouseOver: trace values,
  vertical/horizontal), `tooltip` (HTML, positioning), `legend` (HTML, toggle, isolate),
  `currentTime` (driven by a shared clock signal), `dstIndicator`, `alertLines`,
  `levelSelect`, `crossSectionSelect`, `dataField`.
- Hit testing: bisect on typed x column; scatter/points use lazily built `d3-quadtree`;
  polar uses angular bisect.
- Keyboard & a11y: focusable plot, arrow keys pan, +/- zoom, `Esc` reset, ARIA summary,
  optional hidden data table.

### 3.9 Synchronisation (`sync/`)

State objects are shareable; sync = sharing the same signal.

```ts
const time = sharedScale(time({ timeZone })) // one domain signal
const pointer = sharedPointer({ by: 'x' }) // crosshair across plots
const sel = sharedSelection()

createPlot(elA, { scales: { t: time, q: linear() }, plugins: [crosshair({ pointer })] })
createPlot(elB, { scales: { t: time, h: linear() }, plugins: [crosshair({ pointer })] })
```

- Works for any scale (x **or** y), any number of plots, no feedback loops (single source
  of truth), domain events via `time.domain.subscribe(…)`.
- Optional `linkScales(a, b, { transform })` for linked but different scales
  (e.g. UTC vs. local, m vs. ft, offset by forecast lead time).
- Shared `clock` signal for current time across all plots.

### 3.10 Live updates

- `series.append(rows)` → incremental extent (block index), dirty only for marks using the
  series, LOD cache invalidated for the affected x-range.
- Scale `follow` mode: `time({ follow: { window: '48h', lead: '6h' } })` keeps the window
  sliding with new data; automatically suspended when user zooms/pans, resumed on reset.
- Back-pressure: updates coalesced per frame; `plot.pause()`/`resume()` when not visible
  (IntersectionObserver) – no rendering for off-screen plots.
- Optional streaming helper: `connect(series, asyncIterable | WebSocket | EventSource)`.

### 3.11 Styling & theming

- Design tokens as CSS custom properties (`--fews-chart-*`), light/dark themes.
- Style resolution: tokens resolved **once** per theme change into a cache shared by
  canvas renderer, legend symbols and highlight (no `getComputedStyle` on hover).
- Theme change detection: `prefers-color-scheme` media query + opt-in observer on a
  configurable element (not the whole `<html>`), invalidates only `STYLE`.
- Per-mark style may be an object, a CSS class, or a function of the datum (with
  `color` scale support for marks like heatmap/arrows).

### 3.12 Memory & resource hygiene

- No per-point objects, no `slice` copies at render (use index windows).
- Reusable scratch buffers for decimation/quantiles.
- Single ResizeObserver / IntersectionObserver shared across all plots (module-level).
- `destroy()` disconnects observers, removes listeners, detaches from shared signals,
  frees caches; `WeakRef`/`FinalizationRegistry` as safety net in dev mode (warning).

### 3.13 HTML5 Web Component (`element/`)

A standards-based custom element on top of the core API, usable in plain HTML, Vue,
React, Angular or FEWS Web OC config-driven pages without a framework adapter.

```html
<fews-chart
  id="q"
  sync-group="station-123"
  zoom="x"
  pan
  crosshair
  tooltip
  legend="top"
  current-time
></fews-chart>

<script type="module">
  import { defineFewsChart } from '@deltares/fews-web-oc-charts/element'
  import { time, linear, axis, series, fromObjects } from '@deltares/fews-web-oc-charts'
  defineFewsChart() // registers <fews-chart>

  const obs = fromObjects(observations, { x: 'time', y: 'value' })
  const el = document.getElementById('q')
  el.config = {
    scales: {
      t: time({ timeZone: 'Europe/Amsterdam' }),
      q: linear({ nice: true, includeZero: true }),
    },
    axes: [
      axis('t', { position: 'bottom', grid: true }),
      axis('q', { position: 'left', label: 'Discharge', unit: 'm³/s', grid: true }),
    ],
    marks: [
      series(obs, { id: 'obs', x: 't', y: 'q', markers: { symbol: 'circle' }, label: 'Observed' }),
    ],
  }
  obs.append(rows) // live update, same as core API
</script>
```

- **Configuration (v5.0)**: a single `el.config` property with exactly the same shape as
  `createPlot` options – no second config dialect to document and test. Assigning a new
  object is diffed (scales/axes/marks by id) and applied incrementally via signals.
  Attributes cover only simple, string-friendly plot-level toggles: `sync-group`, `sync`,
  `zoom`, `pan`, `crosshair`, `tooltip`, `legend`, `current-time`, `theme`.
- **Future (post-5.0, not in scope)**: declarative light-DOM child config elements
  (`<fews-scale>`, `<fews-axis>`, `<fews-series>`, `<fews-ensemble>`, …) and `src`
  attributes for data loading, built as a mapping onto `el.config`.
- **Escape hatch**: `el.plot` exposes the underlying core plot object for advanced use.
- **Shadow DOM** with an SVG root; theming through CSS custom properties
  (`--fews-chart-*`, inherit through shadow boundary) and `::part(axis|legend|tooltip|plot)`;
  `adoptedStyleSheets` shared across all instances (one stylesheet in memory).
- **Sync**: `sync-group="name"` attribute joins a module-level registry of shared scale /
  pointer / selection signals – synchronising charts is purely declarative.
  `sync="t,pointer"` selects what to share.
- **Events** (bubbling, composed `CustomEvent`s): `domainchange`, `pointerchange`,
  `selectionchange`, `legendtoggle`, `brushend`, `ready`, `error`.
- **Lifecycle**: `connectedCallback` creates the plot, `disconnectedCallback` calls
  `destroy()` (deferred one microtask so DOM moves don't recreate the plot);
  `ElementInternals` for ARIA role/label; works with `form`-free usage only.
- **Data loading**: done by the application (or the Vue layer) in v5.0; the element only
  receives series objects via `el.config` and live updates via `series.append/upsert`.
- **SSR / frameworks**: no work in constructor (spec compliance), upgrade-safe property
  handling (properties set before definition are re-applied), Vue `isCustomElement` docs,
  typed `HTMLElementTagNameMap` + JSX/Vue `GlobalComponents` declarations generated.
- Separate entry point `@deltares/fews-web-oc-charts/element` so core users don't pay for it.

### 3.14 v4 compatibility layer (`compat/`) – full v4 API

Goal: existing v4 code works by only changing the import to
`@deltares/fews-web-oc-charts/compat`. Implemented as thin adapters over the v5 core –
no copy of the v4 implementation.

- **Coverage** – every symbol currently exported from `src/index.ts`:
  - Axes: `Axes`, `CartesianAxes`, `PolarAxes`, `ColourBar`, `defaultDomain`, options types,
    `setOptions`, `redraw`, `update`, `zoom`, `resize`, `resetZoom`, `removeChart`,
    `removeAllCharts`, `accept`, `extent`, `xScales`/`yScales`, `setDomain`, `getScale`,
    `addEventListener('update:x-domain')`.
  - Axis: `XAxis`, `YAxis`, `createAxis`, `AxisType`, `AxisPosition`, `AxisOrientation`,
    `LabelOrientation`, option interfaces.
  - Charts: `Chart` base and all 12 subclasses (`ChartLine`, `ChartMarker`, `ChartArea`,
    `ChartRange`, `ChartBar`, `ChartHistogram`, `ChartArrow`, `ChartDirection`,
    `ChartMatrix`, `ChartProgress`, `ChartRule`, `ChartText`) with `addTo`, `data`,
    `setOptions`, `setAxisIndex`, `visible`, `extent`, `drawLegendSymbol`, tooltip &
    mouseover formatter options, `CurveType`, `TextPosition`.
  - Visitors: `Visitor`/`BaseVisitor` and all 13 visitors (`Legend`, `WarningLevels`,
    `MouseOver`, `ZoomHandler`, `CurrentTime`, `DstIndicator`, `LevelSelect`,
    `CrossSectionSelect`, `DataField`, `AlertLines`, `BeaufortAxis`, `PanHandler`,
    `BrushHandler`) incl. their callbacks/events and enums (`ZoomMode`, `WheelMode`, …).
  - Utils, Scale (`ScaleOptions`, `ResetZoom`, wind/current scales), `Tooltip`,
    Data types (`DataPoint`, `dataExtentFor`), SCSS class names (`wb-charts`, layer classes).
- **Mapping strategy**:
  - `CartesianAxes`/`PolarAxes` → wrap a v5 plot; `x[i]`/`y[i]` options → named scales
    `x0, x1, y0, y1`; `xScales[i]` returns a live d3 scale view onto the v5 scale signal.
  - `Chart.addTo(axes, axisIndex, id, style)` → creates the matching v5 mark; `DataPoint[]`
    converted to columnar store (cached; re-converted on `data` setter).
  - `ChartLine` + `ChartMarker` with same data stay two marks (behaviour preserved).
  - Visitors → v5 plugins; `accept(visitor)` installs the plugin; `redraw()` becomes a no-op
    or `invalidate()` (v5 tracks changes itself).
  - Explicit `redraw()`/`zoom()` calls trigger a full invalidate for identical semantics;
    lodash-style deep-merge `setOptions` reimplemented locally (no lodash dependency).
  - DOM structure & CSS classes kept where apps style them (`.wb-charts`, layer groups,
    `data-chart-id`), so existing stylesheets keep working.
- **Verification**: run the full v4 `examples/` Playwright snapshot suite and v4 unit tests
  against `compat`; visual diffs within a small tolerance are reviewed and documented.
- **Deprecation**: each compat symbol carries `@deprecated` JSDoc with a pointer to the v5
  equivalent; one-time console warning in dev builds. Compat is tree-shaken away when not
  imported; planned removal in v6.

## 4. Proposed public API sketch

```ts
import { createPlot, time, linear, axis, series, ensemble, band,
         zoom, pan, crosshair, tooltip, legend, currentTime,
         sharedScale, sharedPointer, fromObjects } from '@deltares/fews-web-oc-charts'

const t = sharedScale(time({ timeZone: 'Europe/Amsterdam', follow: { window: '3d' } }))
const pointer = sharedPointer()

const obs = fromObjects(observations, { x: 'time', y: 'value' })
const fc  = createEnsemble({ x: fcTimes, members: fcMatrix })

const plot = createPlot(el, {
  scales: { t, q: linear({ nice: true, includeZero: true }) },
  axes:   [axis('t', { position: 'bottom', grid: true }),
           axis('q', { position: 'left', label: 'Discharge', unit: 'm³/s', grid: true })],
  marks:  [ensemble(fc, { x: 't', y: 'q', show: { spread: [[5,95],[25,75]], median: {} } }),
           series(obs, { x: 't', y: 'q', line: {}, markers: { symbol: 'circle' }, label: 'Obs' })],
  plugins:[zoom({ mode: 'x', wheel: 'x' }), pan(), crosshair({ pointer }),
           tooltip(), legend({ position: 'top' }), currentTime()],
})

obs.append([{ time: new Date(), value: 12.3 }])   // live update, only obs mark repaints
plot.update({ marks: [...] })                      // declarative diffing of marks by id
plot.destroy()
```

- Integration options, in order of preference:
  1. `<fews-chart>` Web Component (framework-neutral, see 3.13).
  2. Core functional API (`createPlot`) for full control.
  3. Thin Vue adapter `@deltares/fews-web-oc-charts/vue` (composables `useSharedScale`,
     `useSeries`, signal↔ref bridge) – optional, built on top of 1/2.

## 5. Package & tooling

- Same package `@deltares/fews-web-oc-charts`, **v5.0.0** (semver major, breaking API).
  v4 stays on a `v4` maintenance branch (bug fixes only) with npm dist-tag `v4`;
  v5 pre-releases as `5.0.0-alpha.x` / `beta.x` under dist-tag `next`.
- ESM only, `sideEffects` limited to the element registration file.
- Entry points via `exports`: `.` (core), `./element` (Web Component), `./vue`,
  `./compat` (v4 API shim, last phase), `./style.css` (default theme tokens).
- Dependencies: d3 sub-packages only (`d3-scale`, `d3-shape`, `d3-axis`, `d3-array`,
  `d3-selection`, `d3-zoom`, `d3-brush`, `d3-quadtree`, `d3-interpolate`,
  `d3-scale-chromatic`, `d3-time`, `d3-format`). **Removed: `lodash-es`, `luxon`**
  (and the full `d3` bundle). No runtime dependency for reactivity (own core).
- Source layout:
  ```
  src/core (signals, scheduler, scopes)  src/time  src/data  src/scales  src/axes
  src/layout  src/coords  src/render/{svg,canvas}  src/marks  src/plugins  src/sync
  src/theme  src/element  src/vue  src/compat
  ```
- Strict TS, no circular imports (lint rule `import/no-cycle`), no barrel re-imports inside src.
- Tests: Vitest unit (reactive core incl. glitch/ordering/disposal tests, time-zone
  module vs. v4/luxon reference output, data, layout, scales, decimation, quantiles in
  Node), Vitest browser + Playwright visual regression (port existing `examples/` as
  fixtures, both core API and `<fews-chart>` variants), perf benchmarks (`vitest bench`)
  with budgets in CI, memory snapshots via Playwright CDP (create/destroy 1000 elements
  → no growth).
- Bundle-size budget in CI (size-limit): core + series + zoom/crosshair < 45 kB gz;
  `element` entry adds < 8 kB gz.

## 6. Performance targets (CI-enforced benchmarks)

| Scenario                                                | Target                                   |
| ------------------------------------------------------- | ---------------------------------------- |
| 1M-point series, pan frame                              | < 8 ms                                   |
| 50 members × 10k steps ensemble, initial render         | < 50 ms                                  |
| Pointer move (crosshair + tooltip, 20 series)           | < 2 ms, no data-layer work               |
| Append 1 point/s to 10 plots                            | only affected marks repaint; < 1 ms/plot |
| Memory, 1M points                                       | < 20 MB (vs. ~80 MB today)               |
| 6 synchronised plots, wheel zoom                        | 60 fps                                   |
| 100 `<fews-chart>` elements on one page, initial render | < 1 s total; only visible ones render    |

## 7. Phased roadmap

| Phase                         | Content                                                                                                                                                                                                  | Exit criterion                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 0. Spike (1–2 wk)             | Own reactive core prototype + scheduler, columnar series, M4 decimation, SVG line renderer; `Intl` zone-offset prototype; benchmark vs. v4                                                               | ≥5× gain on pan with 1M points in SVG; zone offsets match luxon on test matrix                            |
| 1. Core                       | Reactive core hardened (scopes, diagnostics), `time/` module (luxon replacement), plot container, layout engine, named scales, axes (value/time/band/degrees), coordinate systems, theme tokens, destroy | Static basic-line/secondary-axis/time-axes examples pixel-equal to v4                                     |
| 2. Marks                      | `series` (line+markers+area), band, bar, histogram, rule, text, heatmap, arrows/direction, progress; SVG first, canvas opt-in                                                                            | All static examples ported                                                                                |
| 3. Interaction                | Pointer hub, zoom, pan, brush, crosshair, tooltip, legend                                                                                                                                                | mouseover/zoom/panning/brush examples ported                                                              |
| 4. Sync & live                | Shared scale/pointer/selection/clock, follow mode, append/retention, IntersectionObserver pause                                                                                                          | shared-zoom/shared-panning + new live-stream example                                                      |
| 5. Ensembles                  | Ensemble store, quantile cache, members/spread/median rendering, ensemble tooltip/legend                                                                                                                 | 50×10k benchmark meets target                                                                             |
| 6. Domain plugins             | Warning levels, alert lines, current time, DST indicator (on new `time/`), level select, cross-section select, data field, Beaufort, colour bar, polar wind/current roses                                | Feature parity checklist complete                                                                         |
| 7. Web Component              | `<fews-chart>` with `el.config`, plot-level attributes, `sync-group` registry, events, Shadow DOM theming, typings                                                                                       | All examples also runnable via `<fews-chart>`; works in Vue app without adapter                           |
| 8. Adoption                   | Vue adapter, docs site from examples, migration guide, FEWS Web OC integration behind a flag; `5.0.0-beta`                                                                                               | FEWS Web OC runs on v5 behind a flag                                                                      |
| 9. Compatibility layer (last) | Full v4 public API in `./compat` (see 3.14); deprecation warnings; migration guide per class                                                                                                             | Complete v4 example + test suite runs unchanged against `compat` (import path swap only); `5.0.0` release |

## 8. Additional improvements to consider

- **Missing-value & quality flags**: render gaps, flag-based styling (FEWS flags/doubtful
  values), comments in tooltip.
- **Forecast-aware time axis**: T0 marker, lead-time secondary axis, analysis vs forecast
  styling switch at T0.
- **Thresholds as data**: warning levels varying in time (time-dependent thresholds).
- **Annotations API**: click-to-annotate, events, editable points (data editing for
  FEWS "edit time series" use cases) with undo.
- **Web Worker offloading**: quantiles/decimation of very large ensembles in a worker
  (transferable typed arrays).
- **Deterministic rendering for tests** (fixed DPR, fonts) and SSR SVG export in Node.
- **i18n**: all labels/formatters via `Intl` with injected locale; RTL-safe legend.
- **Accessibility**: keyboard navigation, screen-reader summary, high-contrast theme,
  colour-blind-safe default palettes.
- **Small multiples helper**: `createGrid(el, plots, { shared: ['t'] })` for many
  synchronised panels with one shared pointer/tooltip.
- **Diagnostics**: dev-mode overlay showing redraw counts per layer and frame time.

## 9. Remaining open decisions

None at this time.

Browser baseline details: build `target: 'baseline-widely-available'` set explicitly in the
Vite library config and a matching `browserslist` entry; Playwright suite runs on
Chromium, Firefox and WebKit (`test:all-browsers`) in CI; supported minimum versions are
documented in the README and migration guide. Required platform features
(`adoptedStyleSheets`, `ElementInternals`, `OffscreenCanvas`, `structuredClone`,
`Intl.DateTimeFormat#formatToParts` with time zones, CSS `:state()`) are all covered.

Deferred (revisit after v5.0): automatic SVG/canvas switching (`renderer: 'auto'`);
declarative child config elements and `src` data loading for `<fews-chart>`.
