# FEWS Web OC Charts

## Chart background

Plots are transparent outside the plotting canvas, matching v4. By default,
`background: 'canvas'` applies the theme background only to the canvas (the
sector or annulus for polar plots). Set `--fews-chart-background` to customize
that color. Axes, titles and outer margins keep the host's background visible.

Use `background: 'plot'` to explicitly color the entire plot instead.

Tooltips, cross-section labels and axis callouts use a white background in light
mode and a black background in dark mode. Callout and tooltip text also follows
the theme; cross-section sample labels retain their series colors. Override
`--fews-chart-tooltip-background` and `--fews-chart-tooltip-color` on the plot host
to customize these colors, including tooltips portalled to the document body.
With `theme: 'auto'`, the colors follow the system color scheme. Set `themeElement`
to observe live CSS class/style changes, as with other theme tokens.

Mouseover crosshair callouts render above persistent cross-section callouts and
sample labels, regardless of plugin installation order.

## Automatic mark color contrast

FEWS configuration colors can be retained as source colors while improving their
visibility against the current theme:

```ts
const plot = createPlot(host, {
  theme: 'auto',
  colorContrast: 'auto',
  // scales, marks, plugins, ...
})
```

`colorContrast` defaults to `'none'`, preserving exact configured colors. Opting
into `'auto'` adjusts OKLCH lightness only when contrast is insufficient, preserving
hue and reducing chroma only when needed to fit sRGB. It targets **3:1 for mark
colors** and **4.5:1 for colored text**. The original mark configuration is never
modified; switching themes recalculates from the original colors rather than
repeatedly modifying an adjusted color.

Adjustment applies to lines, markers, fills, rules, text and vector marks, including
composite layers and their SVG/canvas renderers, legend swatches and highlights.
Tooltip symbols, tooltip names and cross-section sample labels use the tooltip
background instead of the canvas background. Heatmap color-scale mappings and
their swatches remain unchanged because their colors encode values.

The comparison uses `--fews-chart-background` (or the theme default), not the
transparent outer margins or an external legend's host background. Set an opaque
theme background to match your canvas; translucent theme backgrounds are rejected
by automatic adjustment. CSS color variables and `currentColor` resolve in the
plot host/theme context. Observe live host class/style changes with `themeElement`.
SVG paint servers such as gradients, `none` and context paints are left intact.

Alpha and separate fill opacity are preserved. Alpha is included in the contrast
calculation; when its target cannot be reached without changing alpha, adjustment
uses the highest attainable contrast. Separate fill opacity is not increased or
included in the target, so shaded areas retain their intended transparency.
This improves visibility, but does not guarantee accessibility for translucent
fills, thin lines, overlapping marks, or distinguishability between series.

Use `plot.update({ colorContrast: 'none' })` to disable adjustment, or
`plot.update({ colorContrast: undefined })` to restore the default.

## Tooltip formatting

Use optional formatter hooks to customize tooltip values, units and ranges:

```ts
import { tooltip } from '@deltares/fews-web-oc-charts'

const inspection = tooltip({
  digits: 2,
  formatValue: (_value, context) => context.defaultText,
  formatUnit: (context) => (context.scale === 'discharge' ? 'm3/s' : ''),
  formatRange: (_lower, _upper, context) => `[${context.defaultText}]`,
})
```

`formatValue(value, context)` receives the raw coordinate, sample value or range
endpoint. `context.defaultText` preserves the built-in precision, category text,
and time-scale locale/time-zone formatting. `formatRange(lower, upper, context)`
receives raw endpoints for composite bounds (bars, histograms and stacked areas)
and heatmap x/y ranges; its default text joins the `formatValue` results with an
en dash. `formatUnit(context)` receives the formatted text as `defaultText` and
returns a suffix, appended with a space once per value or complete range.
Return an empty string for no unit. All hooks must return strings; errors propagate.

The exported `TooltipFormatContext` includes the `mark`, raw `hit` (including
layer/stack information where applicable), `axis`, named `scale`, `digits`, and
`defaultText`. Axis is `x` or `y`, or `value` for a heatmap cell's independent value
(which has no named positional scale). Horizontal composite values and bounds use
their x axis. Units are supplied by the hook, not inferred from axis labels.

Hooks affect both visible text and accessible labels, never source data or
crosshair callouts. Linked crosshair coordinates are omitted only when their
displayed text exactly matches the tooltip's text, including units. Formatter
results are rendered as plain text, not HTML.

Replace hooks using `inspection.update({ formatValue: ... })`, or pass `undefined`
to restore the default. Without hooks, existing formatting is unchanged.

Single-valued bars omit the implicit layer name. Explicit bar and stacked-area
layers show their label, falling back to their declared id.

Composite bounds (bars, histograms and stacked areas) default to `bounds: 'stacked'`:
only hits with a stack id append `bounds: lower–upper`. Use `bounds: 'always'`
to include unstacked bounds, or `bounds: 'never'` to omit bounds even for stacks.
Stack names remain visible independently of this setting. Visible text and
accessible labels follow the same policy; heatmap coordinate ranges are unaffected.
Change it with `inspection.update({ bounds: 'always' })`, or pass `undefined` to
restore `'stacked'`.

## Listening to changes

Use `subscribe()` to observe any library signal, including a shared scale's domain.
Notifications are scheduled and coalesced through the chart frame scheduler:

```ts
import { subscribe, timeScale } from '@deltares/fews-web-oc-charts'

const time = timeScale({ domain: [start, end] })
const stop = subscribe(time.domain, (domain, previous) => {
  // domain: readonly [number, number]; previous: readonly [number, number] | undefined
  model.value = domain
  console.log('Previous domain:', previous)
})

// Later, when the consumer is removed:
stop()
```

The optional `immediate` setting delivers the current value synchronously. Provide an
`AbortSignal` with `{ signal }` to unsubscribe when its controller is aborted. Subscriptions
created inside a reactive scope are disposed with that scope. Use `{ equals }` to override
the signal's equality check.

Use `plot.subscribe()` for subscriptions that should not outlive a plot. It accepts the same
options and returns the same idempotent unsubscribe function, and it also unsubscribes
automatically when the plot is destroyed. Subscribing through a destroyed plot throws.

```ts
const plot = createPlot(element, { scales: { time } })
plot.subscribe(time.domain, (domain) => {
  model.value = domain
})

// No separate cleanup is needed for the subscription:
plot.destroy()
```

Time scale domains use numeric epoch milliseconds and preserve fractional milliseconds
through domain updates, autoscaling, live-follow windows and projection. Setting
`nice: true` opts into UTC calendar-based domain rounding. Converting endpoints to
JavaScript `Date` objects truncates fractional milliseconds.

Continuous scale constructors (`linearScale`, `logScale`, `timeScale`, `degreesScale`,
`angularScale` and `radialScale`) expose domains as `readonly [number, number]`.
`bandScale` exposes `readonly string[]`. These types are retained by `sharedScale()`,
domain updater callbacks and `subscribe()`. Domain options and writes use the same
types; annotate separately declared numeric pairs as tuples rather than `number[]`:

```ts
const domain: [number, number] = [start, end]
const time = timeScale({ domain })
time.domain.update(([from, to]) => [from + 0.25, to + 0.25])
```

Use `ScaleHandle<'time'>` (or another specific kind) when annotating a known scale.
The default `ScaleHandle` and dynamic `plot.scales` bindings remain general-purpose:
their domains contain numbers or strings, and runtime validation still enforces each
scale's domain rules. Brush events also use dynamic scale names and general domains;
forward them through the matching plot binding when the scale kind is not statically known.

For changes associated with a plot, use its typed `on()` method:

```ts
const stop = plot.on(
  'domainchange',
  ({ scale, domain, previous, explicit, source }) => {
    console.log(scale, domain, previous, explicit, source)
  },
  { signal: abortController.signal },
)
```

Domain events identify the scale binding, shared scale handle, effective domain,
whether the domain is explicit, and its source (`zoom`, `wheel`, `pan`, `brush`, `reset`,
`autoscale`, or `api`). `layoutchange` and `legendchange` use the same typed listener API.
Matching bubbling, composed DOM `CustomEvent`s are dispatched on `plot.element`, with
typed `detail` available to `HTMLElement` and `SVGElement` event listeners. Existing
`legendtoggle` and `brush` events are also available through `plot.on()`.

## Updating bands

`band()` (also exported as `range()`) returns a reactive handle. Update interval
data and appearance without replacing the mark or calling `plot.update()`:

```ts
const envelope = band({
  id: 'envelope',
  x: 'time',
  y: 'value',
  xValues: [
    [t0, t0],
    [t1, t1],
  ],
  yValues: [
    [low0, high0],
    [low1, high1],
  ],
  curve: 'linear',
})

envelope.update({
  xValues: [
    [t1, t1],
    [t2, t2],
  ],
  yValues: [
    [low1, high1],
    [low2, high2],
  ],
  fill: '#1677a6',
  opacity: 0.3,
})
```

Updates accept `x`, `y`, `xValues`, `yValues`, `fill`, `opacity`, `curve`,
`shapeRendering`, `label`, `legendGroup` and `visible`.
Omitted fields stay unchanged. Passing `undefined` clears optional styling
(`opacity` returns to 1); both data arrays remain required and must have equal
lengths. Supply both arrays in one update when changing their length. Input ranges
are copied, and invalid updates throw without changing the mark.

Rendering, automatic scale domains and legend symbols react to updates. Existing
interval nodes and curved paths are reused while their geometry type stays the same.
Curved bands still require equal x endpoints and a cartesian plot. New scale bindings
are validated against every plot using the mark before an update is applied; the
target scales must exist and have the correct directions and types. Identity (`id`)
stays fixed; replace the mark to change it.

Legend visibility is preserved when omitted from an update, including changes made
by legend toggles. Use `visible: false` to hide the band or `visible: undefined` to
restore the default (`true`). Set `label: undefined` to remove its legend entry or
`legendGroup: undefined` to ungroup it. Bindings and legend options can be updated
alongside data and style in one atomic patch:

```ts
envelope.update({ y: 'forecast', label: 'Forecast range', legendGroup: 'Forecasts' })
```

## Series gaps

Series y values accept `null` or `NaN` for missing values. Both are stored as `NaN` gaps,
so nullable data from services can be passed directly to `createSeries`, `append`,
`prepend`, `replace`, `upsert` and `fromObjects`. Gaps are ignored by y extents.

```ts
const values = createSeries({ x: [t0, t1, t2], y: [1.2, null, 1.4] })
values.append({ x: [new Date(t3)], y: [null] })
```

## Box zoom and brush-driven domains

`zoom({ mode: 'x' | 'y' | 'xy' | 'auto' })` supports primary-button drag-to-zoom.
In `auto` mode, horizontal and vertical drags zoom that axis, while diagonal drags
zoom both axes. Since wheel zoom and double-click reset have no drag direction to
infer, they apply to both axes allowed by `wheel`.
The selection is shown while dragging and applied on release, with one
`domainchange` event per changed scale and `source: 'zoom'`. Horizontal and vertical
selections show brush-style directional handle guides while dragging; the guides
disappear on release or cancellation and are not persistent resize controls. Selected directions
must span at least 3 SVG pixels; clicks and cancelled drags do not zoom.
Selections are clamped to the plot, continuous scales use their local projections
(including reversed, log and time scales), and band scales are left unchanged.
Horizontal and vertical box zooms hold the other continuous axis at its current
range, rather than autoscaling it to the newly visible data. This also pauses
live follow on that axis. Clearing its domain, updating its autoscale policy, or
resetting that axis resumes automatic domain calculation.
`wheel: 'none'` disables only wheel zoom. `modifier` controls box zoom;
`wheelModifier` independently controls wheel zoom. Omitting `wheelModifier` (or
updating it to `undefined`) makes wheel zoom use `modifier`, preserving the shared
modifier behavior. Double-click reset remains modifier-independent.
Shift-wheel zoom also accepts horizontal wheel deltas, since browsers can redirect
the wheel movement to horizontal scrolling while Shift is held.

For example, use Shift for drag/box zoom, Ctrl for drag-to-pan, and no required
modifier for wheel zoom:

```ts
const navigation = zoom({
  mode: 'x',
  wheel: 'x',
  modifier: ModifierKey.Shift,
  wheelModifier: ModifierKey.None,
})
const panning = pan({ mode: 'x', modifier: ModifierKey.Ctrl })
// Install both handles in the plot's plugins array.
```

Matching brush and pan gestures take precedence over box zoom, independent of plugin
order. To combine interactions, use distinct modifiers, for example default box zoom,
`pan({ modifier: ModifierKey.Ctrl })` and the default Shift brush. A pan with
`modifier: ModifierKey.None` owns all drags, so remove it to enable box zoom.

By default, brush remains selection-only: it does not change domains automatically. Domain
updates made synchronously in a `plot.on('brush', ...)` or DOM `brush` listener
are attributed to `source: 'brush'`:

```ts
plot.on('brush', ({ scales }) => {
  plot.scales.t.scale.domain.set(scales.t)
})
```

Deferred updates (after an `await`, timer or scheduled subscription) are independent
API changes and retain `source: 'api'`.
Echoing an equal persistent selection through `brush.setSelection()` does not cancel
an active drag; changing the controlled selection does. Equal scale domains do not
notify domain subscribers again, but explicit domain writes can still change
autoscale or live-follow behavior.
Box zoom and brush-driven domain updates pause a time scale's live follow window,
just like wheel zoom and pan; reset resumes following.

## Overview brushes bound to detail scales

Use an explicit `targets` map to connect overview scale names to independent detail
scales. The brush initializes its selection from the targets when installed, updates
them continuously during dragging, and follows subsequent target-domain changes:

```ts
const detailTime = timeScale({ domain: [start, end] })
const navigator = brush({
  mode: 'x',
  persistent: true,
  modifier: ModifierKey.None,
  targets: { t: detailTime },
})
const overview = createPlot(overviewHost, {
  scales: { t: timeScale({ domain: [fullStart, fullEnd] }) },
  directions: { t: 'x' },
  plugins: [navigator],
})
```

Targets require `persistent: true` and continuous scales of the same kind as their
named overview scales, with strictly increasing domains. Each target must be distinct
and cannot be any scale installed in that overview plot. `targets` and shared
`selection` handles are mutually exclusive. Multiple mappings support `xy`; `auto`
derives the initial selection direction from the mapped overview scales.

User gestures update targets with `source: 'brush'` and pause live-follow mode.
`setSelection()` also updates mapped targets, with normal API attribution; passing
`undefined` clears only the selection and leaves the target domains unchanged.
Target changes are reflected through the frame scheduler without emitting new brush
events. Equal echoes preserve the gesture; genuine external selection changes cancel it.
Target synchronization stops when the plugin is removed or its plot is destroyed,
and restarts from the current target domains when reinstalled. Resetting targets is
still explicit; clearing a selection does not reset or resume live-follow mode.

## Aligning vertically stacked plots

Share an `alignGroup()` through the plots' `align` option to coordinate their left
and right plot boundaries:

```ts
const alignment = alignGroup()
const detail = createPlot(detailHost, { align: alignment, scales, axes, marks })
const overview = createPlot(overviewHost, { align: alignment, scales: overviewScales })
```

This is opt-in and supports Cartesian plots with outside or inset axes. Hosts should
share a horizontal origin; alignment is in local SVG coordinates, not page coordinates.
The group uses the largest natural left inset and smallest natural right boundary,
so narrower plots constrain the common plotting width. Top and bottom margins remain
independent. Each plot reports its unaligned requirements, avoiding margin feedback
loops as axes, labels, themes or sizes change. Empty plot areas remain valid.

`alignment.bounds` exposes the coordinated `{ left, right }` coordinates as a signal,
or `undefined` when no members have reported layout. Removing `align` (including via
`setConfig()`) or destroying a plot releases its contribution and lets peers shrink
their padding again. No separate group cleanup is required.

## Rebuilding configurations

`plot.setConfig(config)` reconciles by identity. Mark renderers are reused for the same
mark kind and `id`, so value marks such as `line`, `rule` and `text` can be recreated
for every configuration. Scales, axes and plugins are handles that own state such as
live domains and active gestures: passing a new handle replaces the old one and its
state. Keep these handles stable and change them with `handle.update()`.

`handleCache()` does this for configurations that are rebuilt declaratively, for
example from a framework computed value:

```ts
const handles = handleCache()

function toConfig(chart: ChartConfig): PlotConfig {
  return handles.collect(() => ({
    scales: {
      x: handles.use('x', timeScale, { domain: chart.domain }),
      y: handles.use('y', linearScale, { nice: true, includeZero: chart.includeZero }),
    },
    axes: [handles.use('axis:y', axis, 'y', { position: 'left', label: chart.label })],
    marks: chart.series.map((item) =>
      line({ id: item.id, x: 'x', y: 'y', xValues: item.times, yValues: item.values }),
    ),
    plugins: [handles.use('zoom', zoom, { wheel: 'x' })],
  }))
}

plot.setConfig(toConfig(nextChart))
```

`use(key, factory, ...args)` returns the handle cached under `key`, or creates it with
`factory(...args)`. A trailing plain-object argument holds the options. On reuse, only
options that changed since the previous `use` of that key are passed to `update()`, and
options that are no longer supplied are unset, including nested ones. Unchanged
configuration therefore does not reset live state: a zoomed domain is kept until the
configured `domain` itself changes. A different factory or different leading arguments,
such as the scale name of an `axis`, create a new handle.

Option values are compared structurally for plain objects and arrays, and by identity
for functions, stores and library handles. Hoist callbacks such as `autoscale` or
`format` out of the rebuild to avoid reapplying them on every pass. `collect()` batches
its updates and forgets keys that were not used, so removed handles are dropped; a key
used twice in one pass throws. Use `delete(key)` or `clear()` to force recreation.
