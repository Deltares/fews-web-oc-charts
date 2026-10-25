# FEWS Web OC Charts

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
