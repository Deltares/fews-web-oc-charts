# Plan: FEWS Web OC Charts v5

## 0. Decisions taken

| Topic                  | Decision                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package                | Keep `@deltares/fews-web-oc-charts`, release as **major v5**                                                                                                                    |
| Default renderer       | **SVG**; canvas is an explicit opt-in per mark or plot-wide. **No `auto` renderer** for now                                                                                     |
| Time handling          | **Remove `luxon`**; use `Intl.DateTimeFormat` + `d3-time` (see 3.3.1)                                                                                                           |
| Reactivity             | **Own reactive core** (no external signals library)                                                                                                                             |
| Distribution           | Core ESM API **plus an HTML5 Web Component** (`<fews-chart>`, see 3.13)                                                                                                         |
| Web Component          | Tag prefix **`fews-`**; v5.0 configured via **`el.config` property only** (no child config elements)                                                                            |
| v4 compatibility layer | **Full v4 public API**, delivered in the **last phase** of the roadmap (see 3.14)                                                                                               |
| Multi-series layouts   | **Grouped bars, named stacks (including side-by-side stacked bars) and stacked areas are v5.0 requirements**, with shared columnar layout and SVG/canvas parity (see 3.6.1)     |
| Browser support        | **Baseline Widely Available** as of each release date; freeze the exact minimum browser versions for v5.0.0 in the support manifest, build targets and CI matrix. No polyfills. |

## 1. Analysis of the current library (v4.7)

| Area           | Current situation                                                                                                                                                                                     | Consequence                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Redraw         | `CartesianAxes.zoom()` calls `plotter()` on **every** chart and `redraw()` on **every** visitor; `resize`, theme change, legend toggle all trigger full redraws                                       | Cost scales with total content, not with what changed                           |
| Theme          | `MutationObserver` on `<html>` class → full `redraw()`                                                                                                                                                | Any unrelated class change redraws everything                                   |
| Data           | `DataPoint[]` = array of objects `{x: Date, y: number}`; `mapDataCartesian` slices a copy per render; extent recomputed per key                                                                       | ~50–80 bytes/point + `Date` objects, GC pressure, slow for long/ensemble series |
| Styling        | `getComputedStyle()` called in pointer-move & legend paths                                                                                                                                            | Forced style recalcs on hover                                                   |
| Ensembles      | One `Chart` per member; percentiles computed by the app                                                                                                                                               | N DOM groups, N tooltips, N extents                                             |
| Line + markers | `ChartLine` + `ChartMarker` can share the source array, but each creates render-window arrays (markers also filter)                                                                                   | Duplicates derived work, window arrays, legend entries and hit-tests            |
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
2. **Columnar data** – typed arrays, shared time columns, no per-point objects in
   canonical storage; explicit ownership and bounded derived caches (see 3.2.1).
3. **Composition over inheritance** – plain functions & objects, small modules, no
   `instanceof`, tree-shakable ESM, no lodash.
4. **Named, shareable state** – scales, pointer and selection are first-class objects that
   can be shared between plots → synchronisation is free.
5. **d3 for the math, not the scheduling** – keep `d3-scale`, `d3-shape`, `d3-axis`,
   `d3-zoom`, `d3-brush`, `d3-array`, `d3-time`, `d3-format` and `d3-quadtree`, but
   import sub-packages only. Time formatting uses `Intl`; hit testing uses `d3-quadtree`
   (not `d3-delaunay`).
6. **Explicit lifecycle** – `plot.destroy()` releases observers, listeners, buffers.
7. **Options stay editable** – construction is not a configuration boundary. Typed
   updates and explicit unsetting work consistently without recreation or `redraw()`
   (see 3.1.1).

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
- State signals: `size`, `margins`, shareable scale `domain`, plot-local scale `range`, per-series `version`,
  `theme`, `pointer`, `selection`, mark `visible`/`style`.
- **Scheduler**: effects don't render directly; they set dirty bits on layers
  (`LAYOUT | AXES | GRID | MARKS(id) | OVERLAY | INTERACTION`) and schedule one rAF.
- Dependency precision examples:
  - y2 domain change → only marks bound to y2 + y2 axis/grid.
  - pointer move → only overlay layer (crosshair, highlight, tooltip); never data layers.
  - legend toggle → one mark's visibility + autoscale of its scales (if enabled);
    a grouped/stacked layer toggle also invalidates its composite layout (3.6.1).
  - theme change → style token cache refresh; canvas layers repaint, SVG via CSS vars only.

#### 3.1.1 Runtime options: update, unset & replace

All public plot, mark, axis, scale and built-in plugin handles expose
`update(patch)` with the same option names used at construction. No string-path
setters, manual `redraw()`, or mutation of internal D3 objects is required.

| Patch input                      | Meaning                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------ |
| Key omitted                      | Keep its existing explicit override unchanged                                  |
| `key: value`                     | Set an explicit override, including `false`, `0` and `''` where valid          |
| `key: undefined`                 | Remove the explicit override; resolve from current inheritance/defaults        |
| Nested plain object              | Recursively patch its supplied keys; omitted siblings remain unchanged         |
| Array                            | Replace the entire array, never merge by numeric index                         |
| Function, store or shared handle | Replace the reference atomically; never deep-merge or clone                    |
| `null`                           | A value only where the option type explicitly permits it; never an unset alias |

- **Unset is not disable**: `markers: undefined` restores inherited/default marker
  behaviour; `markers: false` explicitly disables markers. Optional visual components
  (`line`, `markers`, `area`, ensemble display parts) accept `false | Options`.
  Removing a nested override such as `line.stroke` keeps the other line options.
  Resetting a parent removes all its nested overrides. Required references such as a
  mark's data/scale binding cannot be unset unless a documented default exists.
- **Resolution**: retain explicit overrides separately from resolved options. Resolve
  library defaults → applicable plot/theme defaults → handle overrides, with a
  documented precedence per option. Unsetting reveals the **current** inherited value,
  not the constructor value. Remove stale inline SVG/CSS attributes, canvas paint
  settings, formatter callbacks and listeners when their overrides disappear.
- **Types & ownership**: patches explicitly permit `undefined` for resettable keys,
  including with `exactOptionalPropertyTypes`; plain `Partial<T>` is insufficient.
  Readonly option snapshots expose explicit and resolved state without allowing
  mutation to bypass invalidation. Copy owned plain option objects/arrays on input;
  preserve store, shared-handle and callback identity. Check property presence rather
  than truthiness, so explicit `undefined` is distinguishable from an absent key.
- **Collections**: supplied `marks`, `axes` and `plugins` arrays are complete membership/
  order lists; `[]` removes all, omission keeps the collection, and `undefined` restores
  its documented default. `scales` is a named map: omitted names stay bound, and an
  explicit `undefined` removes a binding. Stable explicit IDs identify collection
  entries across updates; reject duplicate IDs. Reuse unchanged handles/resources,
  dispose removed entries, and never re-ingest data for an option-only update.
  Change one item through its retained handle instead of rebuilding the collection.
- **Shared state**: `sharedScale.update(...)` changes its options for all consumers;
  plot updates only change local options/bindings. Removing a scale binding still used
  by a mark/axis is an error unless the same transaction removes/rebinds those users.
  Replacing a scale/mark kind or plugin implementation is an explicit collection/binding
  replacement, not an attempted patch of immutable identity or implementation type.
- **Atomic application**: validate the complete patch before committing; invalid
  options, unknown keys/IDs and dangling references throw a descriptive error with
  the option path, leaving prior state intact. Multiple valid updates within `batch`
  publish together and schedule one frame (batching is not rollback of earlier calls).
  Effective no-op updates schedule no work. Invalidate only affected dependencies;
  changing style/formatters must not rebuild data, extents or LOD unnecessarily.
- **Complete configuration**: `plot.setConfig(config)` replaces the plot configuration
  using the same shape as `createPlot`; omitted plot options return to defaults and
  omitted collections/bindings are removed or defaulted. Unlike `update`, nested plain
  options are replacements, not sticky merges. Reconcile entries by ID and preserve
  data references. Reusing a handle retains its handle-managed options/state; replacing
  its configuration must not silently mutate an externally shared handle. A config
  snapshot does not reset live domains, pointer or selection unless explicitly set.
  `el.config = config` delegates to this path; `el.plot.update(...)` provides patching.
- **Validation coverage**: test set → change → unset → inherit/default for scalar,
  nested, array, callback and feature-toggle options; parent reset; `false`/`0`/`''`;
  strict TypeScript patches; collection removal/reorder; shared-handle updates;
  invalid-patch atomicity; coalescing/no-ops; and cleanup of styles/listeners/caches.
  Run the same scenarios through core, Web Component and Vue adapters, on SVG and
  canvas. Include updating after construction without reconstructing the plot.

```ts
const observed = series(obs, {
  id: 'obs',
  x: 't',
  y: 'q',
  line: { stroke: 'red', width: 2 },
  markers: { symbol: 'circle' },
})
const dischargeAxis = axis('q', { id: 'q-axis', position: 'left', label: 'Discharge' })
const wheelZoom = zoom({ id: 'zoom', mode: 'x', wheel: 'x' })
// Retain these handles when passing them to createPlot.
observed.update({ line: { width: 3 }, markers: false })
observed.update({ line: { stroke: undefined } }) // keep width; restore default stroke
dischargeAxis.update({ label: undefined }) // remove custom label
t.update({ follow: undefined }) // reset follow option for all consumers
wheelZoom.update({ wheel: undefined }) // restore default wheel behaviour
plot.update({ theme: undefined }) // restore inherited/default theme
```

### 3.2 Data store (`data/`)

- `createSeries({ x, y, … })` / `createTable(columns)`:
  - x stored as `Float64Array` (epoch ms for time), y as `Float64Array`/`Float32Array`
    (opt-in precision), missing = `NaN`.
  - x values must be finite and sorted in nondecreasing order. Duplicate x values are
    supported and retain stable input order; y values must be finite or `NaN` (missing).
    Date inputs must be valid; time columns expressed as epoch milliseconds must also
    fall within the valid JavaScript `Date` range. Ingestion validates equal column
    lengths and reports the offending column/index without partially creating or
    mutating a store.
  - Tables additionally support dictionary-encoded categorical columns for band axes,
    with stable category identities and an explicit ordered scale domain. Numeric/time
    x ordering rules above apply to ordered series; categorical tables are not sorted
    numerically. Multi-series layouts use aligned value columns in one table (3.6.1).
  - **Ensemble** = `createEnsemble({ x, members: Float32Array[] | matrix })`: one shared
    x column, member matrix (row-major `members × time`), optional member metadata.
- Growable **ring buffer** with `capacity`, `maxPoints`, `maxAge` retention.
- Mutation ordering and duplicate semantics:
  - `append(rows)` requires rows sorted nondecreasing and the first new x to be greater
    than or equal to the current last x. `prepend(rows)` requires rows sorted
    nondecreasing and the last new x to be less than or equal to the current first x.
    Equal boundary timestamps are legal; append places incoming equal-time samples
    after the existing group, while prepend places them before it, preserving input
    order within each group. Validate the complete mutation before changing buffers
    or indexes; reject out-of-order input rather than silently sorting it.
  - `upsert({ from, to, rows })` atomically replaces the closed x-range `[from, to]`:
    remove every existing sample in that range, then insert the sorted rows (which must
    lie within the range), preserving duplicate timestamps and their input order.
    Require finite bounds and `from <= to`. `maxPoints` retains the newest samples;
    time-based `maxAge` retains samples with `x >= newestX - maxAge`, including all
    duplicates at the cutoff. Retention is applied after a successful mutation.
  - x-only hit testing exposes all samples at the selected timestamp in stable order;
    xy hit testing selects the nearest screen-space sample and breaks exact-distance
    ties by stable source order.
- **Block min/max index** (e.g. 256-sample blocks, segment tree) → O(log n) extent for any
  x-window and fast autoscale while zoomed/panned.
- **LOD / decimation**: M4 / min-max-per-pixel-column decimation on render, retaining
  source indices rather than copied x/y columns; cache ownership and keys in 3.2.1.
  1M points → ~4×width vertices for a continuous line; preserve missing-value gaps.
- Derived columns are lazy & cached by source version and normalised operation parameters:
  ensemble quantiles, mean, median, min/max envelope, exceedance probability for warning
  thresholds. For each requested time step, gather non-missing members into reusable
  scratch storage, sort the valid prefix once, then call `d3.quantileSorted` for all
  requested probabilities. No valid members → `NaN`; median and p50 share one result.
  Bands, member summaries and tooltips reuse these store-owned results across plots.
- Adapters: `fromObjects(array, { x: 't', y: 'value' })`, `fromFewsPiTimeSeries(json)`
  (flag/comment columns preserved), and accepting the v4 `DataPoint[]` for migration.
- Mutations: `append`, `prepend`, `upsert({ from, to, rows })`, `replace`, `clear`; each bumps
  `version` and reports the affected x-range so renderers can patch incrementally.
- Data acceptance tests cover equal-length validation; invalid/non-finite x values;
  unsorted ingestion and mutations; duplicate timestamps and stable ordering; inclusive
  upsert boundaries and rejection of rows outside the replacement range; atomic
  rollback on validation failure; duplicate-aware hit testing; and retention at exact
  `maxAge`/`maxPoints` boundaries, including duplicate timestamps.

#### 3.2.1 Data ownership & D3 boundary contract

This contract is a **phase-0 acceptance requirement**, not a later optimisation.

- **Canonical owner**: a store owns column buffers, retention state, versions and block
  indexes. Marks, plots, the Web Component and Vue adapter retain store references,
  never their own data copies. A shared time column has one owner/version; dependent
  stores subscribe to it, and aligned append/retention updates are batched atomically.
  Object adapters convert once and do not retain source rows in core stores (compat
  retains legacy rows as required by its API).
- **Input ownership**: default ingestion copies caller-owned typed arrays once into
  store-owned storage. An explicit borrowed/read-only mode may reuse buffers, but must
  reject store mutations; external mutation is unsupported. Rendering never copies
  canonical columns. Capacity growth may allocate replacement buffers; account for
  spare capacity and peak old/new buffer overlap in memory benchmarks.
- **D3 shapes**: use numeric source indices with accessors into the columns, not
  reconstructed `{ x, y }` objects or `[x, y]` tuples. Contiguous windows use typed-array
  `subarray` views where applicable; non-contiguous LOD uses reusable, viewport-sized
  typed index buffers. Do not allocate an identity index array of source length.
  A logical-index array-like adapter handles undecimated windows and ring wraparound
  without flattening the store. Verify this adapter against runtime and TypeScript
  D3 signatures; non-array-like iterables are materialised by D3 and are not zero-copy.
  Accessors map logical to physical slots and preserve boundary neighbours and gaps.
- **D3 selections**: `.datum(storeOrView)` retains a reference, not a clone. Discrete
  joins bind stable source identifiers/indices instead of allocating point objects.
  Rebind or clear obsolete views so DOM nodes cannot retain replaced buffers; ring
  slot reuse must not reuse the identity of an evicted sample.
- **Cache ownership**: stores own block indexes and derived-column caches. A bounded
  store-associated LOD cache may be shared across marks/plots only when source columns,
  versions, logical window, x-domain/mapping, pixel width, algorithm and gap policy
  match; include any additional algorithm dependencies. Plot bindings own screen-space
  geometry, spatial indexes and renderer resources. Never cache projected x/y columns
  per mark as a second canonical dataset.
- **Bounds & invalidation**: every cache has an explicit byte/entry limit with LRU
  eviction; reusable scratch buffers are bounded by active viewport/member needs.
  Mutations invalidate intersecting windows; retention, ring-slot reuse and buffer
  replacement invalidate affected index/view references. Version keys alone are not
  eviction: obsolete generations must be released. Last-consumer disposal releases
  shared render caches; destroying one plot must not destroy another plot's store.
- **Geometry keys**: SVG paths and canvas `Path2D` depend on LOD/source versions, both
  scale domains/ranges, coordinate projection, curve, baseline and other geometry
  options. Raster caches additionally depend on DPR and paint/style state. Keep these
  plot-local; invalidate on resize, y-only zoom and polar configuration changes too.
- **Interaction state**: reactive domains/selections are authoritative; D3 zoom/brush
  state is a local interaction adapter, not another persistent source of truth.
  Programmatic/shared domain changes rebase local gesture state without feedback
  loops. Derive transient D3 scales from signals; do not retain parallel domain histories.

### 3.3 Scales & axes (`scales/`, `axes/`)

- Named scales, unlimited count:
  ```ts
  scales: { t: timeScale({ timeZone: 'Europe/Amsterdam' }),
            q: linearScale({ nice: true, includeZero: true }),
            h: linearScale({ reverse: true }), dir: degreesScale() }
  ```
- Shared scale state = `{ domain signal, options, autoscale policy }`; each plot binds
  it to `{ range signal, d3 scale (derived) }`. Different-width plots share domains,
  never pixel ranges or mutable D3 scale instances. Autoscale combines eligible extents
  from live bindings in one shared computation; binding removal updates that union.
- Autoscale policy per scale: `'data' | 'visible' (extent within other-axis window) |
'fixed' | fn`, plus `nice`, `includeZero`, `symmetric`, `defaultDomain`, `padding`.
- Axes are views on scales: `axis('q', { position: 'left', label, unit, grid, format,
tickCount, labelAngle })`. Multiple axes on the same side stack automatically.
- Time axis: `Intl`-based multi-level ticks (e.g. hour row + day row), locale/timezone per
  axis, no global `d3.formatDefaultLocale` (number formatting via `d3.formatLocale`
  instance per plot).
- Polar: `angularScale(...)` & `radialScale(...)` scales with direction/intercept/range; Beaufort and
  colour bar become axis variants.

#### 3.3.1 Replacing luxon (`time/`)

Luxon is currently used for: zone offsets in time-tick generation (`Axis.updateTicksForTime`,
`PolarAxes`), multi-level tick formatting (`generateMultiFormat`), `dateFormatter` with
format tokens, and DST transition search (`DstIndicator`). Replacement:

- `zoneOffset(tz, epochMs)`: derive the offset from cached `Intl.DateTimeFormat` parts
  (`timeZone`, `hourCycle: 'h23'`, numeric date/time parts). Normalize midnight
  consistently. Cache formatter instances by zone/locale/options; offset-result caches
  must use exact instants or transition-safe spans, never fixed-hour buckets that can
  cross an offset transition.
- `zonedTicks(scale, tz, count)`: choose calendar intervals in local civil time and
  resolve each local boundary to its corresponding instant. Do not shift a whole domain
  using one offset: a domain can cross an offset transition. Omit nonexistent local
  boundaries in a spring-forward gap; emit both distinct instants for an ambiguous
  fall-back boundary, ordered by instant. When two emitted ticks have the same local
  label, include an offset/disambiguator in the label.
- `zonedInterval(d3Interval, tz)`: floor/ceil/offset in local civil time for day/week/
  month boundaries (used by ticks, grid, DST indicator, `follow` windows), with the
  same skipped/repeated-time rules as `zonedTicks`.
- Formatting: cached `Intl.DateTimeFormat` instances keyed by (locale, tz, options);
  multi-format picks an option set (`{hour, minute}`, `{weekday, day}`, `{month, day}`,
  `{month: 'long'}`, `{year}`) instead of luxon format strings. `dateFormatter` supports
  a documented token subset (`yyyy`, `yy`, `MM`, `MMM`, `MMMM`, `dd`, `d`, `HH`, `H`,
  `hh`, `h`, `mm`, `m`, `ss`, `s`, `SSS`, `EEE`, `EEEE`, `ZZZ`) implemented using
  `formatToParts`. Unsupported tokens throw a descriptive error; migration guidance
  covers replacing other Luxon-only format strings with a caller-supplied formatter.
- `findTransitions(tz, start, end)`: detect offset change per day then binary search to
  the minute → DST indicator.
- Durations (`'48h'`, `'P3D'`, ms) parsed by a tiny helper for `follow` windows.
  Numeric/millisecond and hour durations are elapsed time; ISO day durations such as
  `P3D` are local calendar days in the scale's time zone, so they need not equal 72
  elapsed hours across a DST transition. Unsupported duration units are rejected.
- Future: switch internals to `Temporal` when broadly available, same public API.
- Test matrix: Europe/Amsterdam, America/Mexico_City (DST abolished 2022),
  Australia/Lord_Howe (30 min DST), Asia/Kolkata (+5:30), UTC. Assert offsets and tick
  instants around both sides of transitions, skipped/repeated local times, day/week/
  month boundaries, and format tokens. Compare against Luxon/v4 where compatibility is
  intended; use explicit expected civil-time results for DST cases where v4 behavior is
  not the contract.

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
- SVG: one `<path>` per series/stroke; use keyed D3 joins only for discrete marks (bars,
  text), not one DOM element per point for continuous series. Bind stable mark/sample
  identifiers or source indices that resolve to store data, never copied `{ x, y }`
  objects, array positions or reusable ring-buffer slots. Define enter, update and exit
  behavior explicitly: enter creates elements and applies initial attributes; update
  refreshes geometry, style and accessibility attributes; exit removes obsolete elements
  and releases bound references to obsolete views. Reorder joined elements to match
  configured draw order. Test entering, updating, removing and reordering, including that
  removed nodes release obsolete data views. Set `vector-effect: non-scaling-stroke`.
- **Gesture fast path**: during pan/zoom apply a transform to cached layers
  (CSS/SVG transform or canvas `drawImage`) and do the full LOD re-render throttled /
  at gesture end.
- Canvas: devicePixelRatio aware, bounded plot-local `Path2D`/raster caches with complete
  geometry/paint dependencies (see 3.2.1).
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
Other marks: `band` (range / min-max), `bar` (single/grouped/stacked, step bars),
`stackedArea` (multi-series filled areas; see 3.6.1),
`histogram`, `arrows`/`direction` (wind/current), `heatmap` (matrix, time×level),
`progress`, `rule` (horizontal/vertical), `text`, `thresholds` (warning levels as a mark),
`colorBar`. Each mark implements:

`arrows({ x, y, xValues, yValues, xEndValues, yEndValues })` draws one vector from
each aligned start coordinate to its end coordinate. Cartesian plots bind `x` and `y`
to continuous x/y scales; polar plots bind them to angular/radial scales and interpret
the endpoint pairs through the plot's clockwise-from-north angular convention.
`direction({ x, y, xValues, yValues, directionValues })` draws a fixed-size bearing
glyph at each aligned position. Bearings are degrees clockwise from north and indicate
the direction a wind/current vector comes **from**, so the glyph points 180° opposite
the bearing; `every` can thin dense glyphs. Both marks accept `null`/`undefined` gaps,
contribute their rendered coordinates to autoscale extents, use SVG by default, and
support Cartesian and polar coordinate systems.

The range `band` mark accepts aligned `xValues` and `yValues` of ascending numeric
`[min, max]` pairs (with `null`/`undefined` gaps), drawing one rectangle per pair on
cartesian numeric/time scales or one annular sector per pair on polar angular/radial
scales. Its public constructor is exported as `range` and `bandMark`, because `band`
is already the public band-scale constructor.

```ts
interface Mark {
  id: string
  update(patch: MarkOptionsPatch): void   // mark-specific typed patch, see 3.1.1
  scales: string[]                       // dependencies → precise invalidation
  extent(scale, window?): [min,max]      // uses block index
  render(ctx: RenderContext): void       // ctx = coordinate system + renderer + LOD
  hitTest(px, py | x): Hit | undefined
  legendSymbol(): SymbolSpec             // declarative, no getComputedStyle
}
```

Marks use `ctx.project()` rather than dispatching on axes classes. Declare supported
coordinate/scale combinations and reject unsupported bindings during configuration
validation, before rendering. Grouped/stacked layouts below are cartesian in v5.0;
polar wind/current roses retain their separately specified behaviour.

#### 3.6.1 Grouped bars, named stacks & stacked areas

These are first-class v5.0 features, not application-side preprocessing or deferred
enhancements. A composite mark owns ordered, independently styled/visible layers over
one aligned table. Share the layout computation between bars and areas; keep ordinary
`series(..., { area })` as the single-series baseline/range fill, not an implicit stack
across unrelated marks.

```ts
import { bar, stackedArea, createTable } from '@deltares/fews-web-oc-charts'

const flows = createTable({
  t: times,
  tEnd: intervalEnds,
  upstream: upstreamValues,
  lateral: lateralValues,
  forecastUpstream: forecastUpstreamValues,
  forecastLateral: forecastLateralValues,
})
const layers = [
  { id: 'upstream', y: 'upstream', label: 'Upstream', fill: '#4477aa' },
  { id: 'lateral', y: 'lateral', label: 'Lateral inflow', fill: '#228833' },
]

// Alternative marks: each can be used in a plot with named t/q scales.
const grouped = bar(flows, {
  id: 'grouped-flow',
  x: 't',
  scales: { x: 't', y: 'q' },
  layers,
  layout: 'grouped',
  interval: { start: 't', end: 'tEnd' },
  groupPadding: 0.1,
  layerPadding: 0.05,
})
const stacked = bar(flows, {
  id: 'stacked-flow',
  x: 't',
  scales: { x: 't', y: 'q' },
  layers,
  layout: 'stacked',
  interval: { start: 't', end: 'tEnd' },
})
const areas = stackedArea(flows, {
  id: 'flow-areas',
  x: 't',
  scales: { x: 't', y: 'q' },
  layers,
  curve: 'linear',
})

// Two independent stacks side by side within each time interval.
const compared = bar(flows, {
  id: 'compared-flow',
  x: 't',
  scales: { x: 't', y: 'q' },
  layout: 'stacked',
  interval: { start: 't', end: 'tEnd' },
  groupPadding: 0.1,
  layerPadding: 0.05,
  layers: [
    { ...layers[0], stack: 'observed' },
    { ...layers[1], stack: 'observed' },
    {
      id: 'forecast-upstream',
      y: 'forecastUpstream',
      label: 'Forecast upstream',
      stack: 'forecast',
      fill: '#66ccee',
    },
    {
      id: 'forecast-lateral',
      y: 'forecastLateral',
      label: 'Forecast lateral inflow',
      stack: 'forecast',
      fill: '#aa3377',
    },
  ],
})

stacked.update({ layout: 'grouped' }) // retain data and stable layer identities
areas.update({ layers: [...layers].reverse() }) // explicit stack/legend order
```

- **Data & alignment**: each layer references a numeric value column in the same
  table and the same x column; equal-length validation and store ownership apply.
  Require unique x keys within these composites (strictly increasing numeric/time
  x, or one row per category); reject duplicates with the offending row/key instead
  of guessing aggregation. This is a mark-specific restriction, not a change to
  ordinary series' duplicate support. Do not zip unrelated stores by index or silently
  interpolate/zero-fill misaligned timestamps. Object/long-form migration examples
  show explicit pivoting, duplicate aggregation and missing-value policy before ingestion.
- **Layout API**: `bar` supports single-series `y` or multi-series `layers` (mutually
  exclusive); multi-series bars require `layout: 'grouped' | 'stacked'`.
  `stackedArea` requires `layers` and a continuous numeric/time x scale. Layer IDs are
  unique within their mark, independent of labels, column names and array positions.
  Array order determines group slots, stack accumulation, drawing and legend order.
  Layer descriptors support `visible`, label and style updates through the normal
  collection replacement contract; unchanged IDs retain resources and visibility
  unless explicitly overridden. Reject incompatible scales/units within a composite:
  all layers share one value scale and one unit, never separate y axes.
- **Named stacks**: layers in stacked bars or `stackedArea` accept `stack: string`.
  Equal stack IDs accumulate together; different IDs start independently from zero.
  If all layers omit `stack`, retain one implicit stack and the simple API above.
  If any layer names a stack, require every layer to supply a non-empty stack ID;
  reject mixed named/unnamed input atomically. Reject `stack` on grouped bars rather
  than ignoring it. Stack IDs are scoped to their composite mark: the same name in
  separate marks does not merge them or coordinate their slots.
  First appearance in the full layer array determines stack order; relative array
  order within each stack determines accumulation. Hidden layers retain their
  position in that ordering. Stack IDs, not display labels or positions, identify
  legend groups and tooltip totals; use the ID as the initial stack label.
  Stacked bars place one slot per named stack side by side within each category/
  interval, yielding grouped-stacked bars without a separate layout mode.
  Named area stacks are independent overlaid stacks, drawn in stack order with
  layer order within each stack; they are not horizontally grouped or added together.
  Hit-test ties between overlapping area stacks select the topmost painted band;
  x-only tooltips include all eligible stacks. Use separate plots for non-overlapping
  area-stack comparisons.
- **Bar geometry**: support vertical and horizontal orientation, swapping category/
  interval and value axes consistently. Band scales supply the outer category band;
  numeric/time axes require explicit interval start/end columns or a positive
  pixel width centred on x, never infer widths from a viewport's first sample.
  Interval bounds must be finite, ordered and non-overlapping across rows; include
  full interval bounds in extents/window lookup. Grouped layers divide the outer
  band/interval into stable layer slots, each measured from zero; stacked bars divide
  it into stack slots, with all layers in one stack sharing that slot's width.
  `groupPadding` insets the outer band/interval; `layerPadding` separates adjacent
  layer slots in grouped mode or stack slots in stacked mode, never stacked segments.
  Document defaults and validate padding fractions in `[0, 1)` and positive
  widths. Clip geometry, not the underlying intervals; reversed scales, irregular
  time intervals and resize must not change sample identity or group membership.
- **Stack semantics**: use a zero baseline with separate positive and negative
  accumulators (diverging stacking) in data space, before projection. For values
  `[3, -2, 4]`, endpoints are `[0, 3]`, `[-2, 0]`, `[3, 7]`, with extent `[-2, 7]`.
  Grouped values use extent `[-2, 4]`. Include zero and cumulative endpoints in
  stacked extents, including visible-window autoscale; never use only raw maxima.
  Accumulate positive/negative values separately for each named stack and union their
  extents, never sum independent stack totals. For stacks A = `[3, 4]` and
  B = `[5, -2]`, the combined value extent is `[-2, 7]`, not `[-2, 12]`.
  Require a linear value scale for stacks in v5.0; reject log scales and unsupported
  offsets explicitly. Percent-normalised and streamgraph layouts
  are not part of this initial contract.
- **Missing & zero values**: zero is a valid value, not a gap. A missing (`NaN`)
  visible layer makes that stack's row a gap, avoiding a misleading partial
  total; other stacks at the same x remain valid. Stacked areas break only the
  affected stack at that row and never bridge it. A grouped missing
  value leaves only its own slot empty. All-missing/empty composites contribute no
  data extent, use scale `defaultDomain` and create no hit candidates. Hidden layers
  do not contribute to missing-value checks, sums, extents or hit tests.
- **Visibility & updates**: hiding a layer restacks the remaining visible layers in
  its stack; other stacks' totals are unchanged. Grouped bars retain hidden layer
  slots and stacked bars retain fully hidden stack slots so other bars do not jump
  horizontally. Only explicit membership/order changes remove/reorder those slots.
  Changing a layer's `stack` retains its layer ID and invalidates both the old and
  new stacks; validate the complete replacement layer array before committing.
  A layer change invalidates dependent composite geometry, extents and hit indexes, not
  unrelated marks or canonical columns. Append/prepend/upsert/retention use the
  existing atomic table mutation contract, updating all aligned columns together.
  Recompute affected stack rows; membership/order/visibility changes rebuild the
  applicable layout. Validate patches before committing and support unsetting
  layout/style options under 3.1.1 without reconstructing the plot.
- **Derived data & LOD**: cache bounded columnar lower/upper stack endpoints and
  extent indexes by table/column versions, stack membership/order, layer order,
  visibility and gap policy; never materialise D3's source-sized nested tuple output
  as a second dataset.
  Compute stacks before decimation. Stacked areas use one shared retained-index set
  per stack for all its boundaries, preserving gap edges, sign changes and boundary
  extrema;
  independently decimating each layer is invalid because shared edges can diverge.
  Preserve viewport neighbours and apply the same curve to shared boundaries;
  initially support linear and step curves, rejecting unsupported curves explicitly.
  Bars use interval/window culling, not line decimation that drops categories.
  Account for endpoint, index and scratch buffers under 3.2.1 with explicit limits.
- **Rendering & interaction**: SVG and canvas consume the same endpoints/group slots;
  keyed SVG rectangles use `(layerId, sampleId)`, areas one path per layer.
  Hit testing uses actual rectangles or filled stack bands, not raw y or nearest
  vertices alone; highlights follow the selected segment. Tooltips expose layer ID,
  label, original value, stack ID, stack lower/upper bounds and per-stack positive/
  negative totals where applicable, without replacing raw values with cumulative
  heights. x-only tooltips
  list eligible layers in configured order; zero-height/zero-width geometry is not
  an xy hit candidate. Crosshair, export and accessible data tables use the same
  source identity and raw/derived-value distinction.
- **Legend & adapters**: expose a composite parent and stable per-layer children
  for grouped bars and implicit stacks; named stacks use parent → stack → layer
  hierarchy, with stack entry identity derived from `(markId, stackId)`.
  Stack toggles affect only their layers; layer isolation acts within its stack,
  stack isolation within its composite. Compute parent/stack mixed state recursively
  using the headless model (3.8.1), filled symbols and existing mixed/toggle/isolate
  semantics. Built-in, Web Component and Vue custom legends all drive the same
  visibility/restacking path. Use the same config/handle types in all entry points,
  with no extra element attributes or framework-specific layout state.
- **Acceptance tests**: assert exact endpoints/extents for positive, negative, mixed,
  zero, missing and empty input; layer reorder/hide/show/isolate; duplicate/misaligned
  input rejection and invalid-patch atomicity. Include at least two named stacks
  with independent positive/negative totals and gaps; assert union extents, stable
  stack slots, stack/layer isolation, reassignment, reorder/removal, unnamed defaults,
  mixed named/unnamed rejection and rejection of stack IDs in grouped mode.
  Cover categorical and numeric/time groups, explicit intervals, horizontal/reversed
  axes, padding, clipping, resize,
  visible-window autoscale, appends/upserts/retention and option resets. Verify shared
  area boundaries and gaps before/after LOD and zoom, raw versus cumulative tooltip
  values, segment hit tests, stable IDs and cleanup. Add deterministic grouped-bar,
  stacked-bar, side-by-side named-stack bar and overlaid named-stack area fixtures,
  including overlapping-area hit order, for both SVG/canvas, exports and core/element/
  Vue entry points, including legend-driven restacking and unchanged source buffers.

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
- Entry IDs identify the mark and stable ensemble part (not label or array position);
  partial visibility is represented explicitly in the headless legend model (3.8.1).
- Memory: 50 members × 10k steps ≈ 2 MB Float32 vs. ~40 MB with object arrays.

### 3.8 Interaction & plugins (`plugins/`)

- Single **pointer hub** per plot (one listener set, rAF-coalesced, touch/pen aware) that
  publishes a `pointer` signal `{ px, py, x: Map<scale, value>, inside }`.
- Plugin interface:
  ```ts
  type Plugin = (ctx: PlotContext) => { update?(dirty: DirtyFlags): void; destroy(): void }
  ```
- Built-in plugin factories return configurable handles (3.1.1). Their public
  `handle.update(optionsPatch)` is distinct from the installed instance's internal
  `update(dirty)` render hook; user-defined plugins may opt into the same contract.
- Ported plugins: `zoom({ mode: 'x'|'y'|'xy', wheel, modifier, reset: 'initial'|'full'|'toggle' })`,
  `pan`, `brush` (select range → event), `crosshair` (former MouseOver: trace values,
  vertical/horizontal), `tooltip` (HTML, positioning), `legend` (HTML, toggle, isolate),
  `currentTime` (driven by a shared clock signal), `dstIndicator`, `alertLines`,
  `levelSelect`, `crossSectionSelect`, `dataField`.
- Hit testing: bisect on ordered typed x columns using logical ring indices; polar uses
  angular bisect. Only scatter/xy hit testing builds a lazy, plot-local screen-space
  `d3-quadtree`, storing source indices rather than copied point records. Rebuild on
  relevant source/projection/domain/range changes; map pointers back through temporary
  gesture transforms. D3 allocates tree nodes and bulk-build coordinate scratch arrays:
  include both in memory budgets, cap indexed points, and surface budget exhaustion
  explicitly rather than silently dropping hit-test candidates.
- Keyboard & a11y: focusable plot, arrow keys pan, +/- zoom, `Esc` reset, ARIA summary,
  optional hidden data table.

#### 3.8.1 Headless legend model

Legend state belongs to the core, not to the HTML legend plugin. A Vue component must
be able to render its own legend without installing that plugin, querying chart DOM,
calling `drawLegendSymbol`, or maintaining a second list of visible series.

- Every plot exposes `plot.legend`: a read-only reactive `entries` signal and commands
  `toggle(id)`, `setVisible(id, boolean)`, `isolate(id)` and `showAll()`. The model is
  available without a legend renderer; the built-in HTML plugin consumes this same
  model and commands. It contains metadata/references only, never copies of columns,
  DOM nodes or per-point data.
- Each immutable entry snapshot has `{ id, markId, label, symbol, visibility, disabled,
children }`. `visibility` is `'visible' | 'hidden' | 'mixed'`; `children` is an ordered
  readonly list for ensemble parts or composite bar/area stacks/layers/groups,
  including recursive named-stack hierarchies (3.6.1). IDs remain stable on rename, reorder, style
  changes and config reconciliation; duplicate IDs are rejected. Labels are plain text.
  Unlabelled/excluded marks follow one documented inclusion policy in all renderers.
- `symbol` uses the core's typed, declarative `SymbolSpec`, including composed line/
  marker/area symbols, bar/stacked-area layers and ensemble bands. Resolve theme/mark styles through the shared
  style cache, never by scraping a rendered SVG path. The same spec works for SVG and
  canvas marks; a pure symbol-to-SVG-primitives helper supports framework rendering
  without raw HTML injection or an imperative DOM renderer.
- Commands change authoritative mark/ensemble/composite-layer visibility via the runtime option/state
  path (3.1.1), not a Vue-local mirror. Parent toggle hides all children when fully
  visible, otherwise shows all; child changes recompute the parent's mixed state.
  Isolation operates on siblings at the selected hierarchy level; `showAll()` affects
  eligible, enabled entries only. Disabled commands and stale/unknown IDs report
  descriptive errors rather than silently succeeding.
- Hidden marks retain their legend entries so users can restore them. Visibility
  affects rendering, hit testing and configured autoscale consistently; do not clear
  unrelated source/LOD caches. Programmatic handle updates, built-in UI actions and
  external Vue actions all publish the same state and one `legendtoggle` change event
  per transaction, including affected IDs, resulting visibility and action source.
  Style/label changes refresh metadata without emitting visibility events.
- Entry snapshots update only for legend-relevant changes (membership, ordering,
  labels, visibility, symbol/style/theme), never every pointer move or data append
  when metadata is unchanged. Dispose subscriptions when a consumer or plot is removed.
- Rendering is independent: installing no legend plugin reserves no chart margin and
  creates no legend DOM. External legends use normal application layout; ResizeObserver
  handles resulting chart-size changes. Enforce at most one built-in legend renderer
  per plot, while allowing multiple read-only/custom consumers of the same model.

### 3.9 Synchronisation (`sync/`)

Domain/selection state is shareable; sync = sharing the same signal. Scale bindings and
pointer pixels remain plot-local.

```ts
const time = sharedScale(timeScale({ timeZone })) // one domain signal
const pointer = sharedPointer({ by: 'x' }) // crosshair across plots
const sel = sharedSelection()

createPlot(elA, { scales: { t: time, q: linearScale() }, plugins: [crosshair({ pointer })] })
createPlot(elB, { scales: { t: time, h: linearScale() }, plugins: [crosshair({ pointer })] })
```

- Works for any scale (x **or** y), any number of plots, no feedback loops (single source
  of truth), domain events via `time.domain.subscribe(…)`.
- Shared pointers publish domain values keyed by shared scale identity plus source/
  active state; each plot derives its own pixels and inside/clipping state. The pointer
  hub's `{ px, py, inside }` is local and is never copied into another plot as authority.
- Optional `linkScales(a, b, { transform })` for linked but different scales
  (e.g. UTC vs. local, m vs. ft, offset by forecast lead time).
- Shared `clock` signal for current time across all plots.

### 3.10 Live updates

- `series.append(rows)` → incremental extent (block index), dirty only for marks using the
  series, LOD cache invalidated for the affected x-range.
- Scale `follow` mode: `timeScale({ follow: { window: '48h', lead: '6h' } })` keeps the window
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

- No per-point objects in canonical storage, no `slice` copies at render (use index
  windows). D3 spatial-index objects, legacy rows and opt-in accessibility/export
  materialisation are separately accounted exceptions, not hidden zero-copy claims.
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
      t: timeScale({ timeZone: 'Europe/Amsterdam' }),
      q: linearScale({ nice: true, includeZero: true }),
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
  object calls `plot.setConfig` (3.1.1): complete replacement semantics with incremental
  reconciliation, not a deep merge that retains omitted options. Handles can be updated
  directly or through `el.plot.update` without reassigning the whole configuration.
  Attributes cover only simple, string-friendly plot-level toggles: `sync-group`, `sync`,
  `zoom`, `pan`, `crosshair`, `tooltip`, `legend`, `current-time`, `theme`.
- **Attribute updates/removal**: present attributes are element-owned overrides above
  `el.config` for the corresponding option; removal deletes that override and reveals
  the current config/default value. Removing a boolean attribute does not override
  an explicit `true` in config with `false`. Parse and validate before applying; invalid
  attribute/config changes emit `error` and retain the last valid state. Property/core
  method validation errors also throw to their caller. Reconcile plugin toggles with
  configured plugins, never install duplicate zoom/pointer listeners.
- **Future (post-5.0, not in scope)**: declarative light-DOM child config elements
  (`<fews-scale>`, `<fews-axis>`, `<fews-series>`, `<fews-ensemble>`, …) and `src`
  attributes for data loading, built as a mapping onto `el.config`.
- **Escape hatch**: `el.plot` exposes the underlying core plot object for advanced use.
  Custom legends need not access it: the stable `el.legend` facade exposes the core
  model directly (see below).
- **Custom legend parity with Vue**: provide a named `<slot name="legend">` for
  application-owned light-DOM content. Assigned content automatically suppresses the
  built-in legend renderer, including a configured plugin, without mutating config or
  visibility. Native slots are not scoped Vue slots: applications receive entries and
  invoke commands through `el.legend` and events, not slot props. Legend content is UI,
  not a second configuration dialect or a deferred child config element.
  `legend="external"` suppresses the built-in renderer for a legend elsewhere on the
  page; the model remains available without a slot or plugin. Custom slot/external
  presentation takes precedence over built-in position settings. Removing slot content
  or the external override restores the currently configured renderer. Observe
  `slotchange`, not chart DOM mutations; never install duplicate renderers/listeners.
- **Public legend API**: `el.legend.entries` is the current immutable readonly entry
  snapshot from 3.8.1; `toggle(id)`, `setVisible(id, boolean)`, `isolate(id)` and
  `showAll()` delegate to that model with identical hierarchy/error semantics.
  Before readiness or while disconnected, entries are empty and commands throw a
  descriptive not-ready error. The facade retains identity across reconnects but
  rebinds to the current plot, releasing old subscriptions and snapshots. Callers
  never need to cache a plot reference or duplicate visibility state.
- **Legend notifications**: `legendchange` carries `{ entries }` whenever legend
  metadata/state changes, including label, theme, membership and visibility. Publish
  after committing state so reading `el.legend.entries` agrees with the event detail.
  `ready` exposes the initial populated model; disconnection clears it and notifies
  subscribers. No notifications for pointer moves or appends with unchanged metadata.
  Keep `legendtoggle` for visibility-action details from 3.8.1, with no second mutation
  or feedback loop. Consumers can register events once on the element across reconnects
  and render immediately from the current snapshot if it is already ready.
- **Symbols**: export `renderLegendSymbol(svgElement, symbol)` from the element entry
  point. It uses the same `SymbolSpec`/pure primitive helper as Vue `LegendSymbol`,
  replaces only children it owns in the supplied SVG, sets a documented viewBox and
  decorative `aria-hidden`, and accepts composed symbols for SVG/canvas marks.
  It does not query chart DOM, use `innerHTML`/raw markup, or retain the chart/store.
  Applications own labels, rows, focus management and styling; symbols use resolved
  style metadata so they also work outside the shadow tree.
- **Layout & accessibility**: slotted legend UI participates in normal host layout
  outside the plot viewport, with no additional built-in legend margin; external
  containers use application layout. ResizeObserver updates the plot viewport when
  a legend wraps/resizes. Light-DOM content remains application-styled; provide a
  legend-slot wrapper part for placement. Examples use buttons/checkboxes, stable IDs,
  keyboard access, mixed states and text labels; hidden entries remain operable.
- **Shadow DOM** with an SVG root; theming through CSS custom properties
  (`--fews-chart-*`, inherit through shadow boundary) and `::part(axis|legend|tooltip|plot)`;
  `adoptedStyleSheets` shared across all instances (one stylesheet in memory).
- **Sync**: `sync-group="name"` attribute joins a module-level registry of shared scale /
  pointer / selection signals – synchronising charts is purely declarative.
  `sync="t,pointer"` selects what to share.
- **Events** (bubbling, composed `CustomEvent`s): `domainchange`, `pointerchange`,
  `selectionchange`, `legendchange`, `legendtoggle`, `brushend`, `ready`, `error`.
  Publish typed event maps and legend facade/entry types for plain TS and frameworks.
- **Lifecycle**: `connectedCallback` creates the plot, `disconnectedCallback` calls
  `destroy()` (deferred one microtask so DOM moves don't recreate the plot);
  `ElementInternals` for ARIA role/label; works with `form`-free usage only.
- **Data loading**: done by the application (or the Vue layer) in v5.0; the element only
  receives series objects via `el.config` and live updates via `series.append/upsert`.
- **SSR / frameworks**: no work in constructor (spec compliance), upgrade-safe property
  handling (properties set before definition are re-applied), Vue `isCustomElement` docs,
  typed `HTMLElementTagNameMap` + JSX/Vue `GlobalComponents` declarations generated.
- Separate entry point `@deltares/fews-web-oc-charts/element` so core users don't pay for it.

Custom legend example (after assigning a valid `el.config` as above):

```html
<fews-chart id="custom-chart">
  <ul slot="legend" aria-label="Chart legend"></ul>
</fews-chart>
<script type="module">
  import { renderLegendSymbol } from '@deltares/fews-web-oc-charts/element'

  const el = document.getElementById('custom-chart')
  const list = el.querySelector('[slot="legend"]')
  function renderLegend() {
    const rows = el.legend.entries.map((entry) => {
      const row = document.createElement('li')
      const button = document.createElement('button')
      button.type = 'button'
      button.disabled = entry.disabled
      button.setAttribute(
        'aria-pressed',
        entry.visibility === 'mixed' ? 'mixed' : String(entry.visibility === 'visible'),
      )
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('width', '24')
      svg.setAttribute('height', '16')
      renderLegendSymbol(svg, entry.symbol)
      button.append(svg, document.createTextNode(entry.label))
      button.addEventListener('click', () => el.legend.toggle(entry.id))
      row.append(button)
      return row
    })
    list.replaceChildren(...rows)
  }
  // The application calls defineFewsChart() before awaiting upgrade.
  await customElements.whenDefined('fews-chart')
  el.addEventListener('ready', renderLegend)
  el.addEventListener('legendchange', renderLegend)
  renderLegend() // also handles an already-ready element
</script>
```

This flat example illustrates the API; ship a keyed DOM-update example preserving
focused buttons and a recursive ensemble example for production accessibility.
Applications dispose external listeners when their owning view is removed.

- **Custom legend acceptance tests**: cover slotted and separately mounted legends,
  no built-in DOM/margins, symbol parity with Vue for SVG/canvas marks, parent/child
  visibility, commands/events and programmatic option resets. Verify config replacement,
  labels/themes, slot insertion/removal, `legend="external"` removal, resize, keyboard/
  focus preservation, late upgrade, already-ready subscription, disconnect/reconnect
  and multiple consumers. Assert no retained old plots or duplicate notifications,
  and no data-buffer copies or legend updates for unrelated pointer/data activity.

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
    `x0, x1, y0, y1`; `xScales[i]` returns a live d3-compatible view onto that plot's
    scale binding, with domain writes routed through the authoritative signal.
  - `Chart.addTo(axes, axisIndex, id, style)` → creates the matching v5 mark; `DataPoint[]`
    converted through a shared weak-keyed cache by source-array identity and column
    mapping/conversion policy, not by chart. Setters (even with the same array) and
    explicit `redraw()` refresh legacy in-place edits; coalesce conversion once per
    source/mapping per flush and notify all dependent marks. Release unused conversions.
    Legacy rows remain accessible, so compat memory includes both representations.
  - `ChartLine` + `ChartMarker` with same data stay two marks (behaviour preserved), but
    share converted stores, block indexes and compatible LOD results.
  - Existing `ChartBar` x/x1 category grouping maps to grouped `bar` layers; preserve
    v4 legend/style/spacing behaviour. `ChartArea` scalar and explicit `[y0, y1]`
    fills remain baseline/range fills, never implicitly stacked. New stacking is an
    opt-in core feature, not a change to legacy charts' default semantics.
  - Visitors → v5 plugins; `accept(visitor)` installs the plugin.
  - Explicit `redraw()`/`zoom()` calls trigger a full invalidate for identical semantics;
    lodash-style deep-merge `setOptions` reimplemented locally (no lodash dependency).
    Preserve v4 merge/undefined semantics only in compat; translate resulting changes
    to core updates. Document migration to v5's explicit `undefined` reset rather than
    changing legacy `setOptions` behaviour.
  - DOM structure & CSS classes kept where apps style them (`.wb-charts`, layer groups,
    `data-chart-id`), so existing stylesheets keep working.
- **Verification**: run the full v4 `examples/` Playwright snapshot suite and v4 unit tests
  against `compat`; visual diffs within a small tolerance are reviewed and documented.
- **Deprecation**: each compat symbol carries `@deprecated` JSDoc with a pointer to the v5
  equivalent; one-time console warning in dev builds. Compat is tree-shaken away when not
  imported; planned removal in v6.

### 3.15 Vue component & composables (`vue/`)

The optional Vue 3 entry point provides a first-class **`FewsChart` component backed
directly by core `createPlot`**, not a required wrapper around `<fews-chart>`. Keep core
framework-free; do not require custom-element registration or `isCustomElement` for
this component. The Web Component remains a separate framework-neutral alternative.

- **Component contract**: typed `config: PlotConfig` uses the same configuration as
  core. Apply replacement config references with `plot.setConfig`, preserving stable
  handles/stores and current interaction state (3.1.1). Expose the plot as a readonly
  shallow ref and forward typed `ready`, `error`, domain/selection and legend events.
  Imperative handle updates are supported; reapplying a new config follows the
  documented replacement rules rather than a hidden controlled/uncontrolled merge.
- **Vue-owned legend**: a scoped `#legend` slot receives `{ entries, toggle, setVisible,
isolate, showAll }` from the core model. Supplying the slot selects external legend
  rendering and suppresses the built-in renderer, including any configured legend
  plugin, without changing visibility state or mutating caller config. With no slot,
  preserve the configured built-in legend behaviour; do not install a legend implicitly.
  A typed `legend="external"` presentation prop also suppresses built-in rendering
  for legends mounted elsewhere. Removing the slot/override restores the configured
  renderer with no duplicate DOM/listeners. The component owns only presentation
  selection; the model remains available in every mode.
- **Symbols without chart DOM**: export `LegendSymbol` (props: `symbol: SymbolSpec`)
  to render the declarative symbol as Vue-managed SVG, with no chart-specific
  selectors or `v-html`. Consumers can instead render their own symbol. Legend rows,
  labels, layout, buttons and styling belong entirely to the application and work
  with plain HTML, Vuetify or another component library.
- **Composable alternative**: `usePlot(containerRef, configRef)` returns a readonly
  shallow plot ref and owns create/destroy; `useLegend(plotRef)` returns a readonly
  shallow `entries` ref plus the same commands as the slot. It also accepts a plot
  ref owned by `FewsChart` or application code without taking ownership of that plot.
  An absent/not-yet-mounted plot yields empty entries; actions before readiness throw
  a descriptive error. Watch plot identity, unsubscribe from old instances and reset
  entries on detach; never retain stale actions/entries across replacement.
- **Reactivity boundary**: provide `useSharedScale`, `useSeries` and signal/ref bridges,
  but keep stores, handles and typed arrays raw (`markRaw`/`shallowRef` as appropriate).
  Do not deep-watch/proxy large datasets or clone configs with JSON/`structuredClone`
  (callbacks, shared identities and explicit `undefined` resets must survive).
  Watch config identity; document replacing the config reference for declarative
  changes and using `handle.update` for local patches. No two-way watcher loop or
  automatic rebuilding of data stores on a legend click.
- **Lifecycle & SSR**: create plots only after mount with a valid container; render a
  stable chart container and empty legend entries during SSR, then populate after
  mount. Stop Vue watchers and core subscriptions on scope disposal, destroy only
  owned plots, and support remount/replacement without leaks. Surface validation
  failures through the typed error event and retain the last valid config.
- **Accessibility**: examples use keyboard-operable buttons/checkboxes with accessible
  labels, pressed/checked state and mixed-state support. `LegendSymbol` is decorative
  (`aria-hidden`); hidden series stay operable in the legend. Do not rely on colour
  alone. Supply a recursive ensemble example in addition to the flat example below.
- **Packaging**: Vue is an optional peer dependency, externalised from library builds;
  publish typed component props/emits/slots and composable declarations. Document the
  tested Vue minimum; no Vue runtime imports in core or the element entry point.

```vue
<script setup lang="ts">
import type { PlotConfig } from '@deltares/fews-web-oc-charts'
import { FewsChart, LegendSymbol } from '@deltares/fews-web-oc-charts/vue'

defineProps<{ config: PlotConfig }>()
</script>

<template>
  <FewsChart :config="config">
    <template #legend="{ entries, toggle }">
      <ul aria-label="Chart legend">
        <li v-for="entry in entries" :key="entry.id">
          <button
            type="button"
            :disabled="entry.disabled"
            :aria-pressed="entry.visibility === 'mixed' ? 'mixed' : entry.visibility === 'visible'"
            @click="toggle(entry.id)"
          >
            <LegendSymbol :symbol="entry.symbol" />
            {{ entry.label }}
          </button>
        </li>
      </ul>
    </template>
  </FewsChart>
</template>
```

- **Acceptance tests**: mount a Vue chart with a custom legend and no built-in legend
  DOM/margins; toggle/isolate/show all and verify mark visibility, hit tests and
  autoscale. Verify external handle updates, mixed ensemble state, label/theme changes,
  reorder/removal and option unsetting update the legend without data re-ingestion.
  Cover multiple legend consumers, replacing the plot/config, switching between
  built-in/slot/external rendering, keyboard interaction, invalid commands, SSR/
  hydration and repeated mount/unmount cleanup. A pointer move or data append with
  unchanged legend metadata must not rerender the Vue legend.

## 4. Proposed public API sketch

### Phase 1: plot and named-scale foundation

Run `npm run dev` and use the example index, or open these public-API demos:

- [Basic line and secondary axis](./examples/v5-basic-line/index.html): static SVG lines
  mapped through named time/value scales, including a secondary right axis.
- [Shared domains and plot-local ranges](./examples/v5-shared-scales/index.html):
  shared time/discharge scales, independent resizing, domain updates and destroying/
  recreating one consumer while the other stays live.
- [Runtime options and themes](./examples/v5-runtime-options/index.html): band,
  linear and degree scales, stacked axes, handle updates, nested option unsetting,
  configuration replacement, scoped CSS tokens and explicit cleanup.
- [Civil-time axes](./examples/v5-time-axes/index.html): automatic multi-level time
  labels, locale/time-zone overrides, and spring-forward/fall-back calendar behavior.
- [Polar coordinates](./examples/v5-polar-coordinates/index.html): clockwise and
  anticlockwise angles, intercepts, angular sweep, radial inner radius and projected
  coordinate readouts.
- [Cartesian range marks](./examples/v5-range/index.html): numeric/time interval rectangles,
  independent mark styling, gaps and endpoint autoscaling.
- [Polar range marks](./examples/v5-polar-range/index.html): angular/radial intervals rendered
  as annular sectors, with multiple independently styled layers.

The scale, theme and polar demos remain axes-only; the polar example also reports projected
coordinates using the public `project` API. The basic-line demo uses the narrow static `line()`
foundation for visual fixtures. The [series demo](./examples/v5-series/index.html) now uses
the data-backed foundation and autoscaling described below. The range demos exercise the
cartesian and polar interval mark implementations.
The `v5-spike-*` examples remain separate phase 0 prototypes, not examples of the
public v5 API.

The package root now exports `createPlot`, `createPolarPlot`, `linear`, `time`, `band`,
`degrees`, `angular`, `radial`, `sharedScale`, `axis`, `line`, `range`, `bandMark`, `layout`,
`batch` and `untracked`, alongside the existing v4 exports. (`band` remains the band-scale
constructor; `range` and `bandMark` construct range marks.) The tested phase 0 reactive primitives
have moved into `src/core`; the spike imports remain forwarding modules so the phase 0
fixtures keep working.

```ts
const t = timeScale({ domain: [Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 2)] })
const q = linearScale({ domain: [0, 100], includeZero: true })
const plot = createPlot(container, {
  title: 'Discharge',
  scales: { t, q },
  axes: [
    axis('t', { position: 'bottom' }),
    axis('q', { position: 'left', label: 'Discharge', grid: true }),
  ],
  theme: 'auto',
  themeElement: container, // optional: observe class/style changes on this element
})
const detail = createPlot(otherContainer, { scales: { t, q } })
t.domain.set([Date.UTC(2026, 0, 1, 6), Date.UTC(2026, 0, 1, 18)])
plot.update({ margins: { left: 16 } })
plot.update({ margins: { left: undefined } }) // current default, not constructor value
plot.setConfig({ scales: { t, q } }) // removes axes/title; retains shared domains
plot.destroy()
detail.destroy()
```

- Scale handles are already shareable; `sharedScale(handle)` returns the same handle.
  Their `domain` signal contains an immutable numeric pair (epoch milliseconds for
  time), or an ordered string array for band scales. `domain.set`, `domain.update`
  and `scale.update` validate synchronously and publish through the shared scheduler.
  Explicit domains override autoscaling until unset. Otherwise, live mark extents are
  combined across plot bindings, falling back to `defaultDomain` when empty.
- Each plot owns separate `plot.scales[name]` bindings exposing `range.get()`,
  `project(value)`, `invert(pixel)`, `ticks(count)` and `bandwidth`. No mutable D3
  instance is exposed or shared. Axes determine x/y orientation; without axes, time
  and band scales default to x, and linear/degrees scales to y. Override this locally
  using `directions: { q: 'x' }`. A name cannot represent both directions in one plot.
- Time scales generate civil-calendar ticks in their configured time zone. Time axes
  may override `timeZone` and `locale`; horizontal axes render hour/day or coarser
  multi-level labels, omit nonexistent spring-forward boundaries, and disambiguate
  repeated fall-back labels. Supplying `format` opts out of the automatic label rows.
- The SVG container uses the host's content size, observed by one shared
  `ResizeObserver`; `width`/`height` override individual dimensions, including zero.
  Give the host a height, or provide an explicit height. Rendering is asynchronous
  and coalesced into one animation frame. `plot.size`, `plot.regions`, `plot.theme`
  and handle `options` expose read-only signals; `options.get()` includes immutable
  `explicit` and `resolved` snapshots.
- The pure `layout(size, axes, margins, titleHeight)` function stacks axis bands from
  the plot outwards in collection order. Plot text measurement is cached and bounded;
  margins grow rather than jitter when domain changes alter label widths, and are
  remeasured on resize, axis-option or font changes.
- `theme` accepts `auto` (default), `light` and `dark`. CSS properties
  `--fews-chart-background`, `--fews-chart-foreground`, `--fews-chart-grid`,
  `--fews-chart-accent`, `--fews-chart-font-family` and `--fews-chart-font-size`
  override tokens. Font size is a positive pixel value. Tokens are cached at creation
  and theme changes, never during projection. Colour-only changes preserve axis DOM
  and line geometry, updating only style attributes without reprojecting line points
  or rebuilding SVG paths; font changes remeasure layout and rebuild line geometry.
  Theme observation is opt-in on `themeElement`, never
  implicitly on the document root; system colour-scheme changes are also observed.
- Plot/scale/axis updates support set, recursive patch and explicit `undefined` reset.
  Arrays replace membership/order; omitted scale names remain, while `undefined`
  removes a binding. Removing a scale used by an axis requires removing/rebinding that
  axis in the same plot update. Plot `setConfig` replaces configuration, but does not
  reset reused handle options or live domains. Axis IDs are immutable, duplicate IDs
  are rejected, and invalid patches leave prior state intact.
- `destroy()` is idempotent, removes only the owned SVG, releases local computed
  scales, effects, theme listeners/observers and resize subscriptions, and cancels
  pending plot rendering. It never disposes shared scale/axis handles. Updating a
  destroyed plot throws.

This is the plot/scale foundation, not completion of every roadmap phase 1 exit gate.
Time ticks use local civil-calendar boundaries with `Intl` labels in the configured
locale/zone, including spring-gap omission, fall-fold disambiguation and multi-level
horizontal axis labels. Phase 1 also includes `createPolarPlot`, `angular` and `radial`
scales, angular/radial axes, and `plot.project(angle, radius)` for converting data
coordinates to SVG coordinates. Angular scales default to a clockwise bearing from
north and may configure direction, intercept and angular range; radial scales may
configure an inner-radius fraction. Polar axes keep radial rings, angular spokes and
captions in small, separate SVG rendering functions, with shared plot-local centre/radius
geometry and the existing scale-binding/tick-formatting APIs. Grid copies stay in the
grid layer; axis geometry and captions stay in the axes layer. This is an internal
simplification, not a new renderer or plugin API: phase 2 polar marks, phase 3 hit testing
and phase 6 wind/current roses remain in their respective phases.
The minimal cartesian `line()` mark renders aligned
array-like x/y values against named x/y scales, preserves gaps, and is clipped to the
plot region. Its boolean `line` option defaults to `true`; `line: false` hides the
stroke while retaining configured markers and area. Marks with no enabled line,
markers or area do not contribute autoscale extents. Plot configuration synchronously rejects non-gap values that do not match
their bound scale kind (strings for band scales, numbers otherwise). It is a static fixture primitive: replace the mark to change its values;
polar marks and interaction APIs follow in
their respective phases. The deterministic per-engine visual regression gate remains
part of the phase 1 exit criteria.
`npm run test:visual` renders the basic-line (including the secondary axis),
shared-scales and spring/fall civil-time-axis states in Chromium, Firefox and WebKit
at a fixed viewport and device scale factor. It compares each engine's rendered
pixels against the checked-in, browser-specific SVG reference fixtures under
`test/visual/baselines/<browser>/` using the §5 changed-pixel threshold;
`npm run test:visual:update` refreshes those fixtures after an intentional visual
change. To update one engine only, use
`VISUAL_BROWSERS=firefox npm run test:visual:update` (or `chromium` / `webkit`).
Review generated references before accepting them; a failing comparison is not by
itself a reason to regenerate a baseline.

```ts
const polar = createPolarPlot(container, {
  scales: {
    bearing: angularScale({ domain: [0, 360], direction: 'clockwise' }),
    distance: radialScale({ domain: [0, 100], innerRadius: 0.15 }),
  },
  axes: [
    axis('bearing', { position: 'angular', grid: true }),
    axis('distance', { position: 'radial', grid: true }),
  ],
})
const point = polar.project(90, 50)
```

### Data-backed series foundation

The package root exports `createSeries`, `fromObjects` and `series`. This is a
cartesian SVG foundation, not completion of phase 2 or the live/sync roadmap.

```ts
const data = createSeries(
  { x: new Float64Array([0, 1, 2]), y: new Float64Array([10, NaN, 30]) },
  { capacity: 256, maxPoints: 1000, maxAge: 86_400_000 },
)
const observed = series(data, {
  id: 'observed',
  x: 't',
  y: 'q',
  line: { stroke: '#1677a6', width: 2 },
  markers: { symbol: 'circle', size: 4 },
  area: { to: 0, opacity: 0.2 },
})
// Bind observed through createPlot({ scales, axes, marks: [observed] }).
data.append({ x: [3], y: [40] })
observed.update({ line: { stroke: undefined }, markers: false })
```

- Stores own copied numeric columns, expose checked `xAt`/`yAt` logical accessors,
  and never expose mutable canonical buffers. X accepts finite numbers or valid Dates
  within the JavaScript Date range, ordered nondecreasingly; y accepts finite numbers
  or `NaN`. Optional `precision: 'float32'` applies only to y and rejects overflow.
- `capacity` is an initial allocation hint, not an ingestion limit. Append uses a
  growable ring; `maxPoints` keeps the newest samples and `maxAge` includes every
  duplicate at the cutoff. Prepend/upsert/replace rebuild owned typed columns;
  incremental indexes and caches are not implemented yet.
- Columnar mutations are `append({ x, y })`, `prepend({ x, y })`,
  `upsert({ from, to, rows: { x, y } })`, `replace({ x, y })` and `clear()`.
  Validation is atomic, append/prepend preserve duplicate boundary ordering, and
  upsert replaces the closed range. `version` is a reactive numeric counter;
  `change` reports an immutable `{ version, from, to }` with conservative bounds
  including the old and incoming extents, so retention is covered. Empty append/
  prepend and clearing an empty store do not publish.
- `fromObjects(rows, { x: 'time', y: 'value' }, options)` converts once without
  retaining caller rows. Its mutations accept object rows with the same mapping;
  upsert uses `{ from, to, rows }`. It also accepts legacy `{ x: Date, y: number }`
  rows with the corresponding mapping.
- `series` retains one store reference for line/markers/baseline area and supports
  runtime `update`, nested patch/unset, `visible` and `label` metadata. Defaults are
  line enabled, markers/area disabled. `{}` enables default component options;
  `false` disables; `undefined` restores defaults. IDs are immutable; x/y rebindings
  validate against every live plot before commit. Numeric/time scales only;
  categorical series and polar series are rejected synchronously.
- Store changes schedule only their consumers, coalesced per frame. Geometry keys
  skip unrelated marks and style-only updates; explicit IDs preserve DOM resources
  across membership changes for replacements of the same mark kind, consistently
  for every kind. Without an ID, only the same mark handle preserves its renderer;
  plot position never determines identity. Changing an ID or kind creates a new
  renderer and destroys the old one's resources. Replacements rebind effects and
  validators to the new handle even when the renderer is reused, and remove obsolete
  child nodes (including text labels). Removed/destroyed plots release their effects and
  validators without disposing shared stores or mark handles.
- Scale domains support shared autoscaling as described below. Block indexes, LOD,
  shared time columns across stores, ensembles, borrowed buffers, non-circle markers,
  curves/dashes, canvas, hit testing and legend rendering remain roadmap work.
  The new store temporarily lives in `src/data-store/` to coexist with legacy
  `src/Data/` on case-insensitive filesystems.

### Phase 2 autoscaling (implemented)

- [Autoscaling demo](./examples/v5-autoscale/index.html): compare data, visible,
  fixed and custom policies; move a six-hour window, toggle series/area eligibility,
  append higher samples, and override/resume automatic domains with live readouts.
- Scale option `autoscale` accepts `'data'`, `'visible'`, `'fixed'` or a callback.
  Linear, time, band and radial scales default to `'data'`; degree/angular scales
  default to `'fixed'` to retain their full-circle domain. Explicit `domain` values,
  including `domain.set`/`update`, take precedence over every policy; unset with
  `scale.update({ domain: undefined })` to resume automatic domains.
- Each live plot binding contributes eligible extents to one shared scale-domain
  computation. Domains union across plots regardless of local scale names or pixel
  ranges. Membership changes, mark rebindings, visibility/layer updates, store
  mutations and retention invalidate the union. Removing bindings or destroying
  plots removes their contributions and subscriptions, without disposing shared
  scales, stores or marks.
- Both static `line` and data-backed `series` contribute finite paired samples.
  Gaps, hidden series and marks with all components disabled are excluded. An area
  baseline contributes to its y extent only when the mark has eligible samples.
  Band domains use first-seen category order with duplicates removed.
- `'visible'` includes samples inside the other scale's current domain, with
  inclusive numeric boundaries or band-category membership. This is sample-based:
  it does not interpolate segments at window edges. Each plot uses its own opposing
  scale window before the shared union. If both opposing scales use `'visible'`
  without explicit domains, each uses the other's full-data domain as its window,
  avoiding cyclic domain evaluation.
- Callbacks receive a read-only `AutoscaleContext` with `kind`, `data`, `visible`
  and `defaultDomain`. `data`/`visible` provide immutable union extents on demand,
  or `undefined` when empty. Return a valid domain, or `undefined` for the default.
  Callbacks must not introduce circular dependencies between scale domains.
  Invalid callback output throws on domain evaluation.
- Empty/all-gap unions use `defaultDomain`. Singleton numeric data expands by
  `max(abs(value) * 0.01, 1)` on each side (one millisecond for time), within finite/
  Date bounds. Explicit and default singleton domains remain unchanged.
  `includeZero`, `symmetric`, proportional `padding` and `nice` apply once after
  the union, in that order; radial padding never produces negative domains.
- The series example now autoscales on append, reset and layer toggles. Indexes,
  cached extents and visible-window acceleration remain future work; this foundation
  scans eligible samples without copying or re-ingesting canonical columns.

### Phase 2 rule marks (implemented)

- [Rule demo](./examples/v5-rule/index.html) shows horizontal and vertical continuous-scale rules.
- `rule({ scale, value, stroke?, strokeWidth?, id? })` renders a full-plot reference line;
  the bound scale's x/y direction determines whether it is vertical or horizontal.
  Linear and time scales are supported on cartesian plots. Rules are annotations and
  do not contribute to autoscale extents.
- Browser tests cover orientation, scale projection updates, default/custom styling,
  autoscale exclusion and rejection of unsupported scale/coordinate bindings.

### Phase 2 progress marks (implemented SVG foundation)

- [Progress demo](./examples/v5-progress/index.html) shows rounded polar completion
  tracks and partial progress arcs.
- `progress({ x, y, xValues, yValues, thickness?, fill?, opacity?, id? })` renders
  each angular interval as an SVG arc centered on its radial value. `thickness` is in
  pixels (default 12); `xValues` contains ascending finite angle pairs and `yValues`
  contains nonnegative finite radial values. `null`/`undefined` gaps are skipped.
  Polar angular/radial scales are required. Both interval endpoints and radial
  centers contribute to autoscale extents.
- Browser tests cover projected geometry, gaps, style, autoscaling, keyed renderer
  reuse and rejection of invalid values and bindings.

### Phase 2 text marks (implemented SVG foundation)

- [Text demo](./examples/v5-text/index.html) places labels at aligned x/y coordinates.
- `text({ x, y, xValues, yValues, textValues, dx?, dy?, angle?, fill?, fontFamily?,
fontSize?, fontWeight?, textAnchor?, dominantBaseline?, id? })` renders one SVG text
  element for each non-gap coordinate/label tuple. Linear, time and band cartesian
  scales are supported. Text coordinates contribute to autoscale extents; labels with
  missing coordinates or values are skipped. IDs preserve mark and label DOM identity
  across compatible plot updates.
- Browser tests cover projection updates, offsets/rotation, styling, gaps, autoscaling,
  ID-based reuse and unsupported bindings.

### Phase 2 grouped/stacked bars and shared layout (implemented SVG/canvas foundation)

- [Bars demo](./examples/v5-bars/index.html) compares grouped, implicit stacked,
  side-by-side named stacks and horizontal bars using one aligned table. Controls
  exercise visibility, layer ordering, reversed time scales, append/retention and reset.
- `createTable(columns, { x?, maxPoints?, maxAge? })` owns copied Float64 numeric
  columns (Dates become epoch milliseconds) and dictionary-encoded string columns.
  `x` defaults to the first column and is the ordering/upsert/age-retention key.
  Numeric keys are finite, nondecreasing and within the JavaScript Date range;
  categorical keys retain input order. Column kinds are established on ingestion
  (empty initial columns default to numeric); subsequent mutations preserve them.
  `valueAt(column, row)`, `kind(column)` and `sampleId(row)` are checked accessors,
  not mutable buffer views.
- `append`, `prepend`, `replace`, `upsert({ from, to, rows })` and `clear` update all
  aligned columns atomically. Mutations require exactly the original column names
  and equal lengths. Upsert replaces a closed numeric key range; retention preserves
  surviving sample IDs. Composite constraints also validate before commit, including
  duplicate keys, overlapping intervals and stack overflow. Table mutations currently
  rebuild columns; incremental/ring-based table updates remain phase 4 work.
- `bar(table, { x, scales: { x, y }, y | layers, ... })` separates the table's x
  column from category/value scale names. Single bars accept `y`; composite bars
  require `layers` and `layout: 'grouped' | 'stacked'`. All bars require a linear
  value scale. Category scales support band, linear and time. Numeric/time bars
  require `interval: { start, end }` or positive pixel `width`; band bars use the
  scale bandwidth. Intervals are finite, ascending and non-overlapping (touching
  boundaries are allowed), and full bounds participate in extents/window overlap.
  Width is centred on x; pixel widths do not expand data-space x extents.
- `orientation` defaults to `'vertical'`; `'horizontal'` swaps physical axes while
  keeping `scales.x` the category binding and `scales.y` the value binding. Bind
  those scales to the matching axis positions or explicit plot directions.
  `groupPadding` defaults to `0.1`: that fraction of the outer band/interval is
  removed equally from both ends. `layerPadding` defaults to `0.05`: the gap is
  that fraction of slot step, with no outer slot gap and no gap between stacked
  segments. It has no effect on a single slot. Both fractions must be in `[0, 1)`.
- The shared data-space layout in `src/layout/stack.ts` computes columnar lower/
  upper endpoints with independent positive/negative accumulators per stack.
  Missing visible values gap only their stack; hidden layers do not affect totals
  or gaps. Zero is valid. All-missing/hidden/empty composites contribute no extent.
  Named stacks require non-empty IDs on every layer; grouped bars reject stack IDs.
  Full layer order determines stable layer/stack slots, including hidden slots.
  Replacement layers retain prior visibility for unchanged IDs unless explicitly
  overridden; `visible: undefined` restores default visibility.
- Endpoint buffers are shared by equivalent table/version/layout consumers, not
  projected geometry. The per-table LRU holds at most eight layouts and 32 MiB of
  endpoint/total/gap buffers; oversized layouts are computed but not retained.
  Data changes invalidate the version cache; style-only changes reuse endpoints
  and SVG geometry. This is an endpoint cache, not an extent index or LOD system.
- SVG segments are keyed by layer ID and stable source sample ID, interval-culled
  and plot-clipped. Reversed scales and resizing preserve group membership. Data
  and visible autoscale include zero/cumulative endpoints, union independent stacks
  and include intervals overlapping the category window. Live plot validators reject
  incompatible mark updates atomically; removed/destroyed plots release subscriptions.
- Exact tests cover diverging endpoints, independent stack totals/gaps, union extents,
  hidden slots, reorder/reassignment/removal, resets, malformed input, atomic mutations,
  categorical/time geometry, horizontal/reversed scales, padding, culling, resizing,
  visible autoscale, retained SVG identity and cleanup. Interaction/tooltip/legend
  adapters, block indexes and
  incremental table/stack updates remain separate roadmap work; this is not completion
  of every phase 2 exit gate.

### Phase 2 stacked-area rendering (implemented SVG/canvas foundation)

- [Stacked areas demo](./examples/v5-stacked-area/index.html) compares an implicit
  observed stack with independent named observed/forecast stacks over one aligned
  table. Controls exercise visibility, linear/midpoint-step curves, stacking
  order, reversed time scales, append/retention and reset. "Reverse stacking order"
  changes accumulation within each stack (including the single-stack plot), not
  just paint order; it also reverses the named stacks' front-to-back order.
- [Stacked-area LOD demo](./examples/v5-stacked-area-lod/index.html) uses a dense
  24,000-sample stack to compare sparse and pixel-bucketed views with live path/
  retained-row readouts.
- `stackedArea(table, { x, scales: { x, y }, layers, curve? })` requires numeric/time
  x columns with strictly increasing unique keys, a linear/time x scale and a linear
  value scale. It is cartesian-only. Unsupported curves, offsets, scale bindings,
  malformed layers and mixed named/unnamed stacks are rejected before commit.
- Areas reuse the same bounded columnar endpoint cache as stacked bars. Positive and
  negative values accumulate independently from zero within each stack; extents union
  independent totals rather than summing stacks. Missing visible values break every
  band in the affected stack, while other stacks remain continuous. Hidden layers
  do not contribute to totals or gaps, and zero remains a valid value. Visible value
  autoscale includes interpolated boundaries at viewport edges, including windows
  between source rows, without interpolating across gaps.
- SVG retains one path per layer ID, including hidden layers with empty geometry.
  Named stacks paint in first-appearance order, with relative layer order preserved
  inside each stack. Visibility is retained across descriptor replacement unless
  explicitly overridden; `visible: undefined` restores default visibility. Styling
  falls back from layer to mark to theme accent; opacity defaults to `1`, stroke to
  `none` and stroke width to `0`. Style-only changes reuse endpoints and paths
  without reprojecting geometry.
- Viewport culling retains every in-window row and the adjacent samples outside
  the window. Dense stacks use per-pixel LOD with one retained-index set per stack,
  shared by every layer boundary; bucket endpoints and boundary extrema, sign
  transitions, gaps and viewport neighbours are retained. Linear and step curves
  use the same selected rows. Interaction/tooltip/legend adapters remain
  roadmap work, not claimed as completed phase 2 exit gates.
- Browser tests cover exact diverging geometry, per-stack gaps, named paint order,
  shared endpoint identity with bars, visibility/reset/reassignment/removal, curves,
  viewport neighbours, reverse/resize, style-only reuse, live table mutations and
  retention, autoscale, atomic rejection and plot lifecycle cleanup.

### Phase 2 composite canvas parity and visual fixtures (implemented)

- `bar` (single, grouped, implicit/named stacked and horizontal) and `stackedArea`
  accept `renderer: 'svg' | 'canvas'`. SVG remains the default;
  `mark.update({ renderer: undefined })` restores it. Invalid renderers, including
  `'auto'`, are rejected atomically. The bars and stacked-area demos expose a live
  renderer selector; `?renderer=canvas` opens either demo in canvas mode.
- Both renderers consume the same bar rectangles and stack endpoints. Areas use
  the same per-stack retained rows, gap/sign/extrema preservation, paint order and
  linear/step path geometry. Switching renderers does not copy/re-ingest canonical
  columns or alter sample IDs, endpoints, visibility or autoscaling.
- Each canvas mark owns a transparent, device-pixel-ratio-scaled canvas inside an
  SVG `foreignObject`. Keeping it in the mark's keyed SVG group preserves mixed
  SVG/canvas paint order and the shared plot clip, with SVG axes/grid/title unchanged.
  Geometry updates cache `Path2D` objects; style-only updates repaint existing paths.
  CSS colours/variables and `currentColor` resolve once per layer per repaint.
  Fill opacity and stroke width/colour retain the SVG semantics (opacity affects
  fill, not stroke). Watched theme changes and device-scale changes repaint canvas;
  use the existing `themeElement` observer for live application CSS changes.
  Removing/replacing/destroying marks releases their canvas buffers and references.
- `npm run test:visual` now also checks grouped, implicit stacked, side-by-side
  named-stack and horizontal bars; implicit and overlaid named-stack areas; and
  a step-curve named-stack view after hiding a layer/restacking. Every state runs
  in SVG and canvas in Chromium, Firefox and WebKit against checked-in references
  under `test/visual/baselines/<browser>/`. Canvas pixels are embedded as PNG images
  inside the reference SVG, so the gate tests actual canvas output, not invisible
  SVG substitutes. The existing 0.1% changed-pixel limit still applies.
- Browser tests compare canvas backing pixels exactly against the shared SVG
  rectangle/path geometry, including diverging/zero/missing data, independent
  named stacks, categorical/horizontal bars, interval culling, dense area LOD,
  reverse/resize, visibility/restacking, retention, style-only reuse, renderer
  resets, CSS/high-DPI repaint, mixed renderer order and lifecycle cleanup.
- This completes the composite-renderer/fixture increment, not all phase 2 exit
  gates: plot-wide renderer defaults, canvas for other marks, public SVG/PNG export,
  composite hit testing/tooltips, legend-driven fixtures and element/Vue entry-point
  parity remain their respective roadmap work. Raw SVG DOM serialization alone
  does not capture live canvas bitmaps; the fixture harness explicitly embeds them.

### Phase 2 histogram (implemented SVG/canvas foundation)

- `histogram(table, { x, scales: { x, y }, bins?, domain?, normalization? })`
  reads a numeric/time sample column from `createTable`. Samples need not be
  ordered; use a separate ordered row/time key when the sample column is unsorted
  or contains NaN. Source columns are never reordered or modified.
- `bins` defaults to 10 and is either an exact positive integer equal-width bin
  count or a complete array of finite, strictly increasing edges (including both
  outer edges). Explicit edges and `domain` are mutually exclusive. A count uses
  `domain` when supplied, otherwise the finite sample extent. Constant samples
  expand symmetrically by `max(0.5, abs(value) * 0.01)`. Nonrepresentable or
  nonfinite widths/densities are rejected explicitly, before rendering.
- Bins are `[start, end)`, except the final bin includes its upper edge.
  Duplicates count individually; NaN and out-of-domain values do not contribute.
  Empty bins are retained. Empty/all-NaN input without fixed bounds has no bins;
  fixed bounds retain zero-valued bins. `mark.bins` exposes immutable
  `{ start, end, count, value }` results, cached by source version and bin options.
- `normalization` is `count` (default), `probability` (count / included samples)
  or `density` (probability / bin width). Empty distributions normalize to zero.
  Irregular density bins integrate to one when there are included samples.
- Derived interval tables feed the existing bar geometry, extent and SVG/canvas
  renderers with zero padding and baseline zero. Linear/time sample scales,
  linear frequency scales, vertical/horizontal orientation, reversal, visibility,
  visible-window autoscaling, live table mutations and style-only reuse follow
  the bar contracts. Rebinning uses the full retained source, not the viewport.
  Polar histograms, weights, cumulative distributions and interaction/legend
  adapters are not included in this increment.
- `examples/v5-histogram/` demonstrates irregular/equal-width bins, normalization,
  SVG/canvas switching, orientation, reversal and live/empty data. Browser tests
  cover bin edges, invalid/degenerate inputs, normalization, mutation/retention,
  autoscale, shared geometry, exact SVG/canvas pixels and keyed renderer lifecycle.

### Phase 2 heatmap (implemented SVG/canvas foundation)

- `createGrid({ xEdges, yEdges, values })` owns a dense rectangular matrix.
  Edges are complete, finite, strictly increasing numeric boundaries with finite
  span; time edges are epoch milliseconds. `columns = xEdges.length - 1`,
  `rows = yEdges.length - 1`,
  and `values.length` must equal `columns * rows`. Values are row-major:
  `values[row * columns + column]`. Typed arrays and ordinary numeric arrays are
  accepted, copied, and never mutated. Values use private Float64 storage; edge
  arrays and snapshots are frozen. NaN denotes a missing cell; infinities and
  nonnumeric values are rejected. A single edge allows a zero-cell dimension.
- `grid.snapshot()` exposes dimensions, edges and bounds-checked `valueAt(index)`.
  `grid.replace(input)` validates and publishes an atomic replacement, including
  shape changes. Old snapshots remain stable; `grid.version` is reactive.
  Appending rows/columns, sparse cells, categorical grids and inferred boundaries
  are not part of this increment.
- `heatmap(grid, { scales: { x, y }, color, renderer?, visible?, opacity?, id? })`
  binds explicit edges to Cartesian linear/time scales. A cell spans adjacent
  x and y edges with no implicit padding or centering. Projected minima and
  absolute differences preserve geometry under reversed axes. SVG rectangles
  and canvas paths use identical geometry and plot clipping; wholly offscreen
  cells are culled. Polar, band and other scale kinds are rejected before rendering.
  Time edges must be within the JavaScript Date range, including replacements
  while mounted. Bindings and identity stay fixed; replace a mark to rebind it.
- Positional autoscaling uses the full grid footprint, including NaN cells;
  visible-window autoscaling includes the footprint when the opposite interval
  overlaps the viewport. Empty or hidden grids contribute no extent. Missing
  values use the colour scale's `unknown` colour (transparent by default), rather
  than zero. Data, visibility, resize, reversal, renderer and device-pixel-ratio
  changes invalidate geometry. Colour-only changes reuse retained geometry.
- **Colour is shared infrastructure**, separate from positional `ScaleHandle`s:
  `colorScale({ domain?, colors?, clamp?, unknown? })` returns a reactive handle
  with `map(value)`, `options` and `update(patch)`. Heatmaps share it directly;
  the planned `colorBar` should consume the same handle, not duplicate a palette.
  This increment does not implement `colorBar` itself or register colour scales
  in `plot.scales`, which remains exclusively positional.
- Colour domains are explicit ascending finite pairs (default `[0, 1]`) with
  finite span, intentionally independent of each grid's extent so comparisons
  are stable across plots. Two or more CSS colour literals are equally spaced
  across the domain and interpolated piecewise in RGB. CSS variables and callbacks
  are not supported. `clamp` defaults to true; false enables extrapolation through
  the endpoint segments. A constant domain maps finite values to the palette
  midpoint. NaN/nonfinite mapped values use `unknown` (default `transparent`).
  Invalid updates are atomic; `undefined` restores the constructor's defaults.
- `examples/v5-heatmap/` demonstrates irregular time/level cells, NaN gaps,
  shared palettes, SVG/canvas switching, axis reversal and grid replacement.
  Browser tests cover ownership, shape/edge validation, exact projection and
  canvas pixels, colour mapping, shared invalidation, footprint autoscaling,
  supported bindings, atomic updates and lifecycle cleanup. Tooltip, hit-testing
  and legend adapters remain deferred with the other Phase 2 foundations.

### Target composed API

```ts
import { createPlot, timeScale, linearScale, axis, series, ensemble, bandScale,
         zoom, pan, crosshair, tooltip, legend, currentTime,
         sharedScale, sharedPointer, fromObjects } from '@deltares/fews-web-oc-charts'

const t = sharedScale(timeScale({ timeZone: 'Europe/Amsterdam', follow: { window: '3d' } }))
const pointer = sharedPointer()

const obs = fromObjects(observations, { x: 'time', y: 'value' })
const fc  = createEnsemble({ x: fcTimes, members: fcMatrix })

const plot = createPlot(el, {
  scales: { t, q: linearScale({ nice: true, includeZero: true }) },
  axes:   [axis('t', { position: 'bottom', grid: true }),
           axis('q', { position: 'left', label: 'Discharge', unit: 'm³/s', grid: true })],
  marks:  [ensemble(fc, { x: 't', y: 'q', show: { spread: [[5,95],[25,75]], median: {} } }),
           series(obs, { x: 't', y: 'q', line: {}, markers: { symbol: 'circle' }, label: 'Obs' })],
  plugins:[zoom({ mode: 'x', wheel: 'x' }), pan(), crosshair({ pointer }),
           tooltip(), legend({ position: 'top' }), currentTime()],
})

obs.append([{ time: new Date(), value: 12.3 }])   // live update, only obs mark repaints
plot.update({ theme: undefined })                  // remove explicit theme override
plot.update({ marks: [...] })                      // replace membership; reconcile by id
plot.setConfig(nextConfig)                        // full config, omitted options reset
plot.destroy()
```

- Integration options:
  1. Vue applications: `FewsChart` with a scoped legend slot, or `usePlot`/`useLegend`
     when the application owns the surrounding component (see 3.15).
  2. Framework-neutral applications: `<fews-chart>` Web Component (see 3.13).
  3. Core functional API (`createPlot`) for full control in any framework.

## 5. Package & tooling

- Same package `@deltares/fews-web-oc-charts`, **v5.0.0** (semver major, breaking API).
  v4 stays on a `v4` maintenance branch (bug fixes only) with npm dist-tag `v4`;
  v5 pre-releases as `5.0.0-alpha.x` / `beta.x` under dist-tag `next`.
- ESM only, `sideEffects` limited to the element registration file.
- For each release, record a dated Baseline snapshot and freeze the exact minimum
  versions for Chrome, Edge, Firefox and Safari/iOS in one support manifest. Generate
  or verify the Vite target, `browserslist`, README support table and Playwright minimum-
  version matrix from that same manifest; do not let the moving Baseline target change
  a published release's support contract. Test both the declared minimum versions and
  current stable versions of Chromium, Firefox and WebKit in CI. No polyfills.
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
- CI quality checks: run ESLint (`npx eslint .`) and Prettier (`npm run prettier`);
  both must pass for each phase.
- Tests: Vitest unit (reactive core incl. glitch/ordering/disposal tests, time-zone
  module vs. v4/luxon reference output, data, layout, scales, decimation, grouped/stacked
  layout and stack-safe LOD (3.6.1), quantiles in
  Node, runtime option patch/unset/replacement contract in 3.1.1), Vitest browser +
  Playwright visual regression (port existing `examples/` as
  fixtures, core API, `<fews-chart>` and Vue custom-legend variants), perf benchmarks (`vitest bench`)
  with budgets in CI, memory snapshots via Playwright CDP (create/destroy 1000 elements
  → no growth).
- Deterministic visual fixtures are established in phase 0: pin the Playwright browser
  builds and OS image, use a fixed viewport and DPR, serve pinned test fonts, wait for
  `document.fonts.ready`, and disable animations/transitions. Keep separate baselines
  per browser engine; do not require cross-engine pixel identity. Phase 1 comparisons
  allow at most 0.1% changed pixels with per-channel delta greater than 2; any
  fixture-specific exception is documented and reviewed.
- Performance budgets run on a dedicated, non-shared CI runner with recorded CPU/OS
  and pinned browser build. For latency targets, perform 10 warm-up runs and 30 measured
  runs; enforce the stated target against p95, not a single best run. For the 60-fps
  scenario, enforce p95 frame time <= 16.7 ms during a fixed 10-second interaction.
- Bundle-size budget in CI (size-limit): core + series + zoom/crosshair < 45 kB gz;
  `element` entry adds < 8 kB gz.

## 6. Performance targets (CI-enforced benchmarks)

| Scenario                                                 | Target                                   |
| -------------------------------------------------------- | ---------------------------------------- |
| 1M-point series, pan frame                               | < 8 ms                                   |
| 50 members × 10k steps ensemble, initial render          | < 50 ms                                  |
| Pointer move (crosshair + tooltip, 20 series)            | < 2 ms, no data-layer work               |
| Append 1 point/s to 10 plots                             | only affected marks repaint; < 1 ms/plot |
| Memory, 1M points, core SVG line fixture (defined below) | < 20 MB retained JS/ArrayBuffer memory   |
| 6 synchronised plots, wheel zoom                         | 60 fps                                   |
| 100 `<fews-chart>` elements on one page, initial render  | < 1 s total; only visible ones render    |

Memory fixture: one core store with 1M points (Float64 x/y), capacity exactly 1M, one
1000 CSS-pixel-wide SVG line plot, no markers/spatial index, warmed by 100 distinct
pan/zoom windows. Measure post-GC incremental retained JS heap plus ArrayBuffer backing
stores against the empty-plot baseline, without double-counting buffers. The <20 MB
budget includes 16 MB of columns, block indexes, LOD, scratch and retained path/cache
state. Record browser-native SVG/canvas/Path2D memory separately; this is not a claim
that total browser memory is <20 MB. Record peak allocations during growth separately.

Additional acceptance checks for the ownership contract:

- Line/markers/area and two plots referencing one store retain one set of canonical
  buffers; adding a second same-width plot can reuse LOD but not projected geometry.
- Different-width shared-scale plots retain independent ranges and correct hit tests;
  y-only zoom, resize and external domain updates invalidate geometry/gesture state.
- Wrapped-ring rendering and repeated pan/zoom allocate no source-sized render copies;
  cache counts/bytes stay within limits and plateau rather than grow per window.
- Quantile consumers share results, sort once per requested time step, exclude missing
  members and return `NaN` for all-missing steps.
- Grouped/stacked composites and multiple plots retain one canonical aligned table;
  identical stack consumers share bounded derived endpoints, not projected geometry.
  Repeated layer/stack toggles, stack reassignment, reorders, live updates and pan/zoom plateau within declared
  cache limits. Measure stack computation/LOD separately from rendering; pointer
  moves perform no restacking or data-layer work. Add dedicated multi-layer memory
  fixtures rather than applying the single-line <20 MB budget to stack buffers.
- Compat paired marks convert once per source/mapping per flush, including in-place
  edits followed by `redraw()`; destroying one consumer leaves others functional.
- Separate memory fixtures cover spatial-index peak/retained allocations, ensembles,
  compat dual representations and create/destroy cleanup of shared resources.

## 7. Phased roadmap

| Phase                         | Content                                                                                                                                                                                                                                                                                     | Exit criterion                                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Spike (1–2 wk)             | Own reactive core prototype + scheduler, columnar series, M4 decimation, SVG line renderer; ownership/D3 boundary contract (3.2.1), wrapped-ring and shared-binding probes; `Intl` zone-offset prototype; deterministic visual/performance harness; benchmark vs. v4                        | ≥5× gain on pan with 1M points on the same pinned runner/browser and equivalent output; core ownership/memory checks in §6 pass; offsets and documented DST tick semantics pass the time-zone matrix |
| 1. Core                       | Reactive core hardened (scopes, diagnostics), runtime option update/unset/setConfig contract (3.1.1), `time/` module (luxon replacement), plot container, layout engine, named scales, axes (value/time/band/degrees), coordinate systems, theme tokens, destroy                            | Static basic-line/secondary-axis/time-axes examples pass deterministic per-engine visual regression at the §5 threshold, with no unexplained diffs; core option contract tests pass                  |
| 2. Marks                      | `series` (line+markers+area), band, single/grouped/stacked `bar` with named side-by-side stacks, `stackedArea` with named independent stacks, shared columnar stack layout and stack-safe LOD (3.6.1), histogram, rule, text, heatmap, arrows/direction, progress; SVG first, canvas opt-in | All static examples ported; grouped-bar, stacked-bar, named-stack comparison and stacked-area fixtures pass on SVG/canvas, with exact per-stack layout/extent/gap tests                              |
| 3. Interaction                | Pointer hub, zoom, pan, brush, crosshair, tooltip, headless legend model and built-in legend renderer; composite-layer hit tests, tooltips and visibility                                                                                                                                   | mouseover/zoom/panning/brush examples ported; external legend commands work without legend DOM; composite toggles restack/autoscale correctly                                                        |
| 4. Sync & live                | Shared scale/pointer/selection/clock, follow mode, append/retention, IntersectionObserver pause; incremental aligned-table stack updates                                                                                                                                                    | shared-zoom/shared-panning + new live-stream example; stacked/grouped updates and retention preserve alignment and bounded caches                                                                    |
| 5. Ensembles                  | Ensemble store, quantile cache, members/spread/median rendering, ensemble tooltip/legend                                                                                                                                                                                                    | 50×10k benchmark meets target                                                                                                                                                                        |
| 6. Domain plugins             | Warning levels, alert lines, current time, DST indicator (on new `time/`), level select, cross-section select, data field, Beaufort, colour bar, polar wind/current roses                                                                                                                   | Feature parity checklist complete                                                                                                                                                                    |
| 7. Web Component              | `<fews-chart>` with `el.config`, plot-level attributes, `sync-group` registry, events, Shadow DOM theming, typings, slotted/external legend facade and symbol helper                                                                                                                        | All examples also runnable via `<fews-chart>`; works in Vue app without adapter; config/attribute-removal and custom-legend parity tests pass                                                        |
| 8. Adoption                   | Vue component/composables and scoped/custom legends (3.15), docs site from examples, migration guide, FEWS Web OC integration behind a flag; `5.0.0-beta`                                                                                                                                   | FEWS Web OC runs on v5 behind a flag; Vue custom-legend and lifecycle acceptance tests pass                                                                                                          |
| 9. Compatibility layer (last) | Full v4 public API in `./compat` (see 3.14); deprecation warnings; migration guide per class                                                                                                                                                                                                | Complete v4 example + test suite runs unchanged against `compat` (import path swap only); `5.0.0` release                                                                                            |

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

Browser baseline details: set the Vite library target from the frozen support manifest
and keep `browserslist`, documentation and Playwright minimum-version jobs in sync.
Verify required platform features (`adoptedStyleSheets`, `ElementInternals`,
`OffscreenCanvas`, `Intl.DateTimeFormat#formatToParts` with time zones, CSS `:state()`)
against that matrix. `structuredClone` is not a required platform feature and must not be
used as a prerequisite; configuration updates preserve callbacks and shared identities
without cloning.

Deferred (revisit after v5.0): automatic SVG/canvas switching (`renderer: 'auto'`);
declarative child config elements and `src` data loading for `<fews-chart>`.
