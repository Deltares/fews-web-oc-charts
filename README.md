# FEWS Web OC Charts

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

## Listening to changes

Use `subscribe()` to observe any library signal, including a shared scale's domain.
Notifications are scheduled and coalesced through the chart frame scheduler:

```ts
import { subscribe, timeScale } from '@deltares/fews-web-oc-charts'

const time = timeScale({ domain: [start, end] })
const stop = subscribe(time.domain, (domain, previous) => {
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
