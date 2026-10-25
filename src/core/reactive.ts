export interface EffectScheduler {
  enqueueEffect(effect: () => void): void
}

export interface ReadonlySignal<T> {
  get(): T
  readonly version: number
}

export interface Signal<T> extends ReadonlySignal<T> {
  set(value: T): void
  update(updater: (value: T) => T): void
}

export interface EffectHandle {
  dispose(): void
  readonly runCount: number
}

interface Observer {
  dependencies: Set<Cell<unknown>>
  invalidate(): void
  depth: number
  order: number
}

interface Cell<T> {
  value: T
  version: number
  depth: number
  subscribers: Set<Observer>
}

export interface ReactiveScope {
  run<T>(callback: () => T): T
  createScope(): ReactiveScope
  dispose(): void
  readonly disposed: boolean
}

export interface ComputedSignal<T> extends ReadonlySignal<T> {
  dispose(): void
}

export interface ReactiveDiagnostics {
  effectRuns: number
  activeEffects: number
  activeComputeds: number
  activeScopes: number
}

export interface ReactiveCoreOptions {
  onError?: (error: unknown) => void
}

export interface ReactiveCore {
  signal<T>(value: T, equals?: (left: T, right: T) => boolean): Signal<T>
  computed<T>(calculate: () => T, equals?: (left: T, right: T) => boolean): ComputedSignal<T>
  /** Registers a view whose `get()` reads library signals, so `subscribe` accepts it. */
  register<T, V extends ReadonlySignal<T> = ReadonlySignal<T>>(
    view: V,
    equals?: (left: T, right: T) => boolean,
  ): V
  isSignal(value: unknown): value is ReadonlySignal<unknown>
  equals<T>(source: ReadonlySignal<T>, left: T, right: T): boolean
  onDispose(cleanup: () => void): () => void
  effect(run: () => void | (() => void)): EffectHandle
  createScope(): ReactiveScope
  getDiagnostics(): ReactiveDiagnostics
  batch<T>(run: () => T): T
  untracked<T>(run: () => T): T
}

export function createReactiveCore(
  scheduler: EffectScheduler,
  options: ReactiveCoreOptions = {},
): ReactiveCore {
  let currentObserver: Observer | undefined
  let currentScope: Scope | undefined
  let batchDepth = 0
  let effectsNeedScheduling = false
  let nextObserverOrder = 0
  let effectRuns = 0
  let activeEffects = 0
  let activeComputeds = 0
  let activeScopes = 0
  const pendingEffects = new Set<() => void>()
  const effectObservers = new Map<() => void, Observer>()
  const currentlyScheduledEffects = new Set<() => void>()
  const signals = new WeakSet<object>()
  const signalEqualities = new WeakMap<object, (left: unknown, right: unknown) => boolean>()

  function reportError(error: unknown) {
    if (!options.onError) {
      console.error('Reactive core error:', error)
      return
    }
    try {
      options.onError(error)
    } catch (reportingError) {
      console.error('Reactive core error handler failed:', reportingError, error)
    }
  }

  function safelyRun(callback: () => void) {
    try {
      callback()
    } catch (error) {
      reportError(error)
    }
  }

  class Scope implements ReactiveScope {
    private cleanups: (() => void)[] = []
    private children = new Set<Scope>()
    private isDisposed = false
    private readonly parent: Scope | undefined

    constructor(parent: Scope | undefined) {
      this.parent = parent
      parent?.children.add(this)
      activeScopes += 1
    }

    get disposed() {
      return this.isDisposed
    }

    run<T>(callback: () => T): T {
      if (this.isDisposed) throw new Error('Cannot run a disposed reactive scope.')
      return runInScope(this, callback)
    }

    createScope(): ReactiveScope {
      if (this.isDisposed) throw new Error('Cannot create a scope from a disposed scope.')
      return new Scope(this)
    }

    own(cleanup: () => void) {
      if (this.isDisposed) {
        safelyRun(cleanup)
        return () => {}
      }
      this.cleanups.push(cleanup)
      return () => {
        const index = this.cleanups.indexOf(cleanup)
        if (index !== -1) this.cleanups.splice(index, 1)
      }
    }

    dispose() {
      if (this.isDisposed) return
      this.isDisposed = true
      this.parent?.children.delete(this)
      for (const child of [...this.children]) safelyRun(() => child.dispose())
      this.children.clear()
      for (const cleanup of this.cleanups.splice(0).reverse()) safelyRun(cleanup)
      activeScopes -= 1
    }
  }

  function runInScope<T>(scope: Scope, callback: () => T): T {
    const previousScope = currentScope
    currentScope = scope
    try {
      return callback()
    } finally {
      currentScope = previousScope
    }
  }

  function scheduleEffects() {
    if (batchDepth !== 0 || !effectsNeedScheduling) return
    effectsNeedScheduling = false
    scheduler.enqueueEffect(flushEffects)
  }

  function flushEffects() {
    const currentEffects = [...pendingEffects]
    pendingEffects.clear()
    for (const execute of currentEffects) currentlyScheduledEffects.add(execute)
    currentEffects.sort((left, right) => {
      const leftObserver = effectObservers.get(left)
      const rightObserver = effectObservers.get(right)
      return (
        (leftObserver?.depth ?? 0) - (rightObserver?.depth ?? 0) ||
        (leftObserver?.order ?? 0) - (rightObserver?.order ?? 0)
      )
    })
    for (const execute of currentEffects) {
      currentlyScheduledEffects.delete(execute)
      safelyRun(execute)
    }
    if (pendingEffects.size > 0) {
      effectsNeedScheduling = true
      scheduleEffects()
    }
  }

  function track(cell: Cell<unknown>) {
    if (!currentObserver || currentObserver.dependencies.has(cell)) return
    currentObserver.dependencies.add(cell)
    cell.subscribers.add(currentObserver)
  }

  function notify(cell: Cell<unknown>) {
    for (const subscriber of [...cell.subscribers]) subscriber.invalidate()
    scheduleEffects()
  }

  function signal<T>(value: T, equals: (left: T, right: T) => boolean = Object.is): Signal<T> {
    const cell: Cell<T> = { value, version: 0, depth: 0, subscribers: new Set() }
    const signal: Signal<T> = {
      get() {
        track(cell)
        return cell.value
      },
      get version() {
        return cell.version
      },
      set(next) {
        if (equals(cell.value, next)) return
        cell.value = next
        cell.version += 1
        notify(cell)
      },
      update(updater) {
        const next = updater(cell.value)
        if (equals(cell.value, next)) return
        cell.value = next
        cell.version += 1
        notify(cell)
      },
    }
    signals.add(signal)
    signalEqualities.set(signal, (left, right) => equals(left as T, right as T))
    return signal
  }

  function computed<T>(
    calculate: () => T,
    equals: (left: T, right: T) => boolean = Object.is,
  ): ComputedSignal<T> {
    const cell: Cell<T> = {
      value: undefined as T,
      version: 0,
      depth: 0,
      subscribers: new Set(),
    }
    let dirty = true
    let evaluating = false
    let initialized = false
    let disposed = false
    const observer: Observer = {
      dependencies: new Set(),
      depth: 0,
      order: nextObserverOrder++,
      invalidate() {
        if (disposed || dirty) return
        dirty = true
        notify(cell)
      },
    }

    function evaluate(): T {
      if (disposed) throw new Error('Cannot read a disposed computed value.')
      if (!dirty) return cell.value
      if (evaluating) throw new Error('Reactive cycle detected while evaluating a computed value.')
      evaluating = true
      for (const dependency of observer.dependencies) dependency.subscribers.delete(observer)
      observer.dependencies.clear()
      const previousObserver = currentObserver
      currentObserver = observer
      try {
        const next = calculate()
        if (!initialized || !equals(cell.value, next)) {
          cell.value = next
          cell.version += 1
        }
        cell.depth = Math.max(
          0,
          ...[...observer.dependencies].map((dependency) => dependency.depth + 1),
        )
        observer.depth = cell.depth
        initialized = true
        dirty = false
        return cell.value
      } finally {
        currentObserver = previousObserver
        evaluating = false
      }
    }

    const computedSignal: ComputedSignal<T> = {
      get() {
        track(cell)
        return evaluate()
      },
      get version() {
        evaluate()
        return cell.version
      },
      dispose() {
        if (disposed) return
        disposed = true
        for (const dependency of observer.dependencies) dependency.subscribers.delete(observer)
        observer.dependencies.clear()
        for (const subscriber of [...cell.subscribers]) subscriber.invalidate()
        cell.subscribers.clear()
        scheduleEffects()
        activeComputeds -= 1
        releaseOwnership()
      },
    }
    signals.add(computedSignal)
    signalEqualities.set(computedSignal, (left, right) => equals(left as T, right as T))
    activeComputeds += 1
    const releaseOwnership =
      currentScope?.own(computedSignal.dispose.bind(computedSignal)) ?? (() => {})
    return computedSignal
  }

  function effect(run: () => void | (() => void)): EffectHandle {
    let active = true
    let cleanup: void | (() => void)
    let runCount = 0
    const observer: Observer = {
      dependencies: new Set(),
      depth: 0,
      order: nextObserverOrder++,
      invalidate() {
        if (!active) return
        if (!currentlyScheduledEffects.has(execute)) {
          pendingEffects.add(execute)
          effectsNeedScheduling = true
        }
      },
    }

    function execute() {
      if (!active) return
      pendingEffects.delete(execute)
      for (const dependency of observer.dependencies) dependency.subscribers.delete(observer)
      observer.dependencies.clear()
      safelyRun(() => cleanup?.())
      cleanup = undefined
      const previousObserver = currentObserver
      currentObserver = observer
      try {
        runCount += 1
        effectRuns += 1
        cleanup = run()
      } finally {
        observer.depth = Math.max(
          0,
          ...[...observer.dependencies].map((dependency) => dependency.depth + 1),
        )
        currentObserver = previousObserver
      }
    }

    const handle: EffectHandle = {
      get runCount() {
        return runCount
      },
      dispose() {
        if (!active) return
        active = false
        pendingEffects.delete(execute)
        for (const dependency of observer.dependencies) dependency.subscribers.delete(observer)
        observer.dependencies.clear()
        safelyRun(() => cleanup?.())
        cleanup = undefined
        activeEffects -= 1
        effectObservers.delete(execute)
        releaseOwnership()
      },
    }

    activeEffects += 1
    const releaseOwnership = currentScope?.own(() => handle.dispose()) ?? (() => {})
    effectObservers.set(execute, observer)
    pendingEffects.add(execute)
    effectsNeedScheduling = true
    scheduleEffects()

    return handle
  }

  return {
    signal,
    computed,
    register(view, equals = Object.is) {
      signals.add(view)
      signalEqualities.set(view, (left, right) => equals(left as never, right as never))
      return view
    },
    isSignal(value): value is ReadonlySignal<unknown> {
      return typeof value === 'object' && value !== null && signals.has(value)
    },
    equals(source, left, right) {
      const equality = signalEqualities.get(source)
      if (!equality) throw new TypeError('Expected a signal created by this reactive core.')
      return equality(left, right)
    },
    onDispose(cleanup) {
      return currentScope?.own(cleanup) ?? (() => {})
    },
    effect,
    createScope() {
      return new Scope(currentScope)
    },
    getDiagnostics() {
      return { effectRuns, activeEffects, activeComputeds, activeScopes }
    },
    batch(run) {
      batchDepth += 1
      try {
        return run()
      } finally {
        batchDepth -= 1
        scheduleEffects()
      }
    },
    untracked(run) {
      const previousObserver = currentObserver
      currentObserver = undefined
      try {
        return run()
      } finally {
        currentObserver = previousObserver
      }
    },
  }
}
