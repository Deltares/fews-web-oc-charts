# Instruction: public change-subscription API and plot events (fews-web-oc-charts v5)

Repository: `Deltares/fews-web-oc-charts`, branch `next`.
Related plan sections: `PLAN-v5.md` §3.1 (reactive core), §3.9 (sync, "domain events via
`time.domain.subscribe(…)`"), §3.8.1 (headless legend), §3.15 (Vue adapter).

## 1. Problem

Library state is exposed as `ReadonlySignal<T>` (`get()`, `version`) — e.g.
`scale.domain`, `plot.regions`, `plot.size`, `plot.pointer`, `plot.legend.entries`,
`brush.selection`, every `handle.options`. Consumers cannot be **notified** when these
change:

- `src/index.ts` exports only `batch` and `untracked`; `reactive.effect` / `computed`
  (`src/core/runtime.ts`) are internal.
- Examples poll (`examples/v5-zoom` re-reads `t.domain.get()` on `wheel` events).
- Only two DOM events exist: `legendtoggle` (`plugins/legend/legend.ts`) and `brush`
  (`plugins/brush/brush-plugin.ts`).

Consumers (FEWS Web OC, the planned `./vue` adapter, `<fews-chart>`) need this for
`v-model:domain`, brush ↔ main-chart sync, aligning margins across subplots, and
reactive Vue legends. Without it they have to poll or wrap internals.

## 2. Scope

Deliver three layers. Each one builds on the one before it.

1. **Core primitive**: public `subscribe()` and `effect()` over any library signal.
2. **Typed plot events**: `plot.on(type, listener)` plus matching DOM `CustomEvent`s for
   `domainchange`, `layoutchange` and `legendchange`. `legendtoggle` and `brush` stay
   as they are.
3. **Change attribution**: every domain change carries a `source` (zoom, pan, brush,
   reset, autoscale, api), so apps can tell user interaction from programmatic updates.

Out of scope: shared pointer/selection, `linkScales`, clock, follow mode,
`pause/resume` (other Phase 4 items).

## 3. API specification

### 3.1 Core: `subscribe` and `effect` (export from `src/index.ts`)

```ts
export interface SubscribeOptions {
  /** Call the listener once immediately with the current value (previous = undefined). Default false. */
  immediate?: boolean
  /** Removes the subscription when aborted. */
  signal?: AbortSignal
  /** Custom equality; default: the signal's own equality (no call when unchanged). */
  equals?: (next: T, previous: T) => boolean
}

export type Unsubscribe = () => void

export function subscribe<T>(
  source: ReadonlySignal<T>,
  listener: (value: T, previous: T | undefined) => void,
  options?: SubscribeOptions,
): Unsubscribe

/** Auto-tracked side effect over any number of library signals. */
export function effect(run: () => void | (() => void)): EffectHandle // { dispose(), runCount }
```

Semantics (normative):

- **Timing**: listeners and effects run through the existing frame scheduler
  (`scheduler.enqueueEffect`). They are coalesced to **at most one call per frame per
  subscription**, run **before** that frame's draw, and receive the **latest** value plus
  the value last delivered to this subscriber. They never run synchronously inside
  `set`/`update`. `immediate: true` is the only synchronous call.
- **Glitch-free**: a `batch()` that changes several signals yields one call per
  subscriber, which sees the final consistent state.
- **No-op suppression**: no call when the value is equal to the last delivered one
  (domains compare by value; `equalDomain` already exists).
- **Listener isolation**: the listener body runs `untracked`. Reading other signals
  inside it does not create dependencies. Exceptions go to the scheduler's `onError`
  and do not break other subscribers or rendering.
- **Writes from listeners** are allowed (e.g. clamping a domain). They schedule the next
  frame, and the core's existing cycle detection applies.
- **Lifetime**: `Unsubscribe` is idempotent. When a plot is destroyed, every
  subscription to signals owned by that plot (`plot.*`, its plugins and its mark handles)
  is disposed automatically: subscriptions are registered in the owner's `ReactiveScope`.
  Subscriptions on shared handles (scales, stores, colour scales) stay alive until
  unsubscribed or aborted, because these handles can outlive a plot.
- **Typing**: works on `ReadonlySignal<T>`, `Signal<T>` and `ComputedSignal<T>`.
  Throws `TypeError` for objects that are not library signals.
- `effect` is the existing `reactive.effect`. Its cleanup return runs before the next
  run and on dispose.

Do **not** add a `subscribe` method to `ReadonlySignal` (keeps signals minimal and
tree-shakable). Update the §3.9 sketch in `PLAN-v5.md` to
`subscribe(time.domain, fn)`.

### 3.2 Typed plot events

Add to `Plot` (and `PolarPlot`/`SkewTPlot`):

```ts
export interface PlotEventMap {
  domainchange: DomainChangeDetail
  layoutchange: LayoutChangeDetail
  legendchange: LegendChangeDetail
  legendtoggle: LegendToggleEventDetail // existing
  brush: BrushSelection                 // existing
}

on<K extends keyof PlotEventMap>(
  type: K,
  listener: (detail: PlotEventMap[K]) => void,
  options?: { signal?: AbortSignal },
): Unsubscribe
```

In addition, dispatch each event as `CustomEvent<detail>` on `plot.element`
(`bubbles: true, composed: true`) so the Web Component and plain DOM users get the same
events. `plot.on` is a typed convenience over the same dispatch. Both are delivered in
the same flush. Export `PlotEventMap` and all detail types. Add
`HTMLElementEventMap`/`SVGElementEventMap` augmentation in a `.d.ts` so
`addEventListener('domainchange', e => e.detail.scale)` is typed.

Event details:

```ts
export type DomainChangeSource =
  | 'zoom'
  | 'wheel'
  | 'pan'
  | 'brush'
  | 'reset' // user interaction via built-in plugins
  | 'autoscale' // data/visibility-driven domain
  | 'api' // scale.update / domain.set / setConfig by the app

export interface DomainChangeDetail {
  readonly scale: string // binding name in this plot ('t', 'y2', …)
  readonly handle: ScaleHandle // to detect shared scales across plots
  readonly domain: readonly ScaleValue[] // effective domain (= scale.domain.get())
  readonly previous: readonly ScaleValue[] | undefined
  readonly explicit: boolean // options.explicit.domain !== undefined
  readonly source: DomainChangeSource
}

export interface LayoutChangeDetail {
  readonly size: Readonly<Size>
  readonly regions: PlotLayout // includes plot region and margins
  readonly previous: PlotLayout | undefined
}

export interface LegendChangeDetail {
  readonly entries: readonly LegendEntry[] // same frozen array as plot.legend.entries.get()
}
```

Rules:

- `domainchange` fires **once per changed scale binding per frame**, for every plot bound
  to that scale. With a shared time scale over N plots, each plot fires its own event
  with the same `handle`, `domain` and `source`. Apps that need one notification per
  change should `subscribe(handle.domain, …)` instead.
- `domainchange` fires for autoscale-driven changes too, with `source: 'autoscale'`,
  `explicit: false`.
- `layoutchange` fires when size, margins or the plot region change (by value, not by
  identity). Not on the initial layout unless `on(..., { immediate })` is added later.
  Do not add it now.
- `legendchange` fires only when the entries **signature** changes (labels, symbols,
  visibility, order, membership), reusing the existing signature check in `legend.ts`.
  It must **not** fire on pointer moves or data appends with unchanged metadata.
- No event fires after `destroy()`. `destroy()` removes all `on` listeners.

### 3.3 Change attribution (`source`)

`scale.domain` is a computed effective domain (explicit `options.domain` or autoscale,
`src/scales/scale.ts`). Implement attribution without changing the public `update`
signature:

- Add an internal, module-level "change source" context in `core/runtime.ts`:
  `withSource(source, () => scale.update({ domain }))`. Writes record
  `lastSource` on the scale handle (internal WeakMap), together with the scale
  version they produced.
- Wrap the domain writes in the built-in plugins:
  - `plugins/zoom/zoom-plugin.ts` (`l.55` → `'zoom'`/`'wheel'`; `l.74–83` → `'reset'`),
  - `plugins/pan/pan-plugin.ts` (`l.139` → `'pan'`),
  - brush-to-domain (if/when brush zooms) → `'brush'`.
- When the effective domain changes without an attributed write (data, visibility or
  autoscale-policy change), use `'autoscale'` if `explicit === false`, otherwise `'api'`.
  Any unwrapped `scale.update`/`domain.set`/`plot.setConfig` resolves to `'api'`.
- If several writes coalesce in one frame, report the **last** source.

## 4. Implementation steps

1. `core/runtime.ts`: implement `subscribe` on top of `reactive.effect` plus `untracked`,
   with the previous-value/equality bookkeeping, `AbortSignal` support and owner-scope
   registration (use the current `ReactiveScope` if called inside `scope.run`).
   Export `effect` and `subscribe` (plus `EffectHandle`, `SubscribeOptions`,
   `Unsubscribe` types) from `src/index.ts`.
2. Add `withSource` / `sourceOf(handle)` internals and wrap the plugin writes listed in
   §3.3.
3. `plot/create-plot.ts`: inside the plot `scope`, create one effect per scale binding
   (domain), one for `regions`/`size`, and one for `legend.entries`. Each effect builds
   the detail, dispatches the `CustomEvent` and notifies `on` listeners. Keep a
   listener registry `Map<type, Set<listener>>` and clear it in `destroy()`.
   Reconcile domain effects when `update`/`setConfig` adds, removes or rebinds scales.
4. Types: add `PlotEventMap`, detail interfaces, `on()` on `Plot`/`PolarPlot`/`SkewTPlot`,
   and DOM event-map augmentation.
5. Update the examples to stop polling:
   - `examples/v5-zoom`: replace the `wheel`-driven `updateStatus` with
     `plot.on('domainchange', …)`.
   - `examples/v5-shared-scales`: one `subscribe(t.domain, …)` showing a single
     notification for N plots.
   - `examples/v5-legend`: render an external HTML legend from `legendchange`.
6. Docs: `PLAN-v5.md` §3.9 snippet, §4 API sketch and the Phase 4 row (mark "domain
   events" done). README section "Listening to changes".

## 5. Tests (vitest, `test/Plot/` and `test/core/`)

Core `subscribe`:

- Called once per frame after multiple `set`s; receives latest and previous delivered values.
- `batch` with 3 signal writes → one call per subscriber, consistent state.
- No call when the value is set to an equal value (domain compared by value).
- `immediate: true` calls synchronously with `previous === undefined`.
- `AbortSignal` and `Unsubscribe` both stop delivery; calling them twice is a no-op.
- A throwing listener does not block other listeners or the frame's draw.
- Signal reads inside the listener do not add dependencies.
- A subscription to a plot-owned signal is disposed by `plot.destroy()`; a subscription
  to a shared scale survives destroying one of its plots.
- Passing a non-signal throws `TypeError`.

Plot events:

- `domainchange` with `source` `'zoom'`, `'wheel'`, `'pan'`, `'reset'`, `'api'` and
  `'autoscale'` (after a data `append` with `autoscale: 'data'`); `explicit` is correct.
- Shared time scale over 2 plots: each plot fires once; `handle` is identical;
  `subscribe(t.domain)` fires once.
- Rebinding/removing a scale through `plot.update({ scales })` stops events for the old
  binding and starts them for the new one.
- `layoutchange` on resize and on axis-label change that alters margins; none when the
  size is unchanged.
- `legendchange` on toggle, label update and mark add/remove. **None** on pointer move
  or on `series.append` with unchanged metadata.
- DOM `CustomEvent`s are received via `plot.element.addEventListener` with the same detail.
- No events after `destroy()`; listener registry empty.
- Benchmark guard: 1000 subscribers on one scale add no per-pointer-move work (pointer
  moves don't touch the domain).

## 6. Acceptance criteria

- `import { subscribe, effect } from '@deltares/fews-web-oc-charts'` works and is typed.
- `plot.on('domainchange' | 'layoutchange' | 'legendchange', …)` and the matching DOM
  events are typed, documented and covered by the tests above.
- No example polls library state.
- No regression in existing tests, visual fixtures or the §6 performance benchmarks.
- A FEWS Web OC v5 component can implement `v-model:domain`, brush sync, cross-subplot
  margin alignment and a Vue-rendered legend using only these public APIs.

## 7. Consumer sketch (target usage, for reviewers)

```ts
const t = timeScale({ timeZone: 'Europe/Amsterdam' })
const plot = createPlot(el, { scales: { t, y: linearScale() }, plugins: [zoom(), pan()] })

// v-model:domain (once, regardless of how many plots share t)
const stop = subscribe(t.domain, (domain) => (model.value = domain as [number, number]))

// keep y-zoom only when the user zoomed y
plot.on('domainchange', ({ scale, source, explicit }) => {
  if (scale === 'y') userZoomedY = explicit && source !== 'api'
})

// align brush plot margins to the main plot
plot.on('layoutchange', ({ regions }) =>
  brushPlot.update({ margins: { left: regions.margins.left, right: regions.margins.right } }),
)

// Vue legend
plot.on('legendchange', ({ entries }) => (legendEntries.value = entries))
```
