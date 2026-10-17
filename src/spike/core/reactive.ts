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
}

interface Observer {
  dependencies: Set<Cell<unknown>>
  invalidate(): void
}

interface Cell<T> {
  value: T
  version: number
  subscribers: Set<Observer>
}

export interface ReactiveCore {
  signal<T>(value: T, equals?: (left: T, right: T) => boolean): Signal<T>
  computed<T>(calculate: () => T, equals?: (left: T, right: T) => boolean): ReadonlySignal<T>
  effect(run: () => void | (() => void)): EffectHandle
  batch<T>(run: () => T): T
  untracked<T>(run: () => T): T
}

export function createReactiveCore(scheduler: EffectScheduler): ReactiveCore {
  let currentObserver: Observer | undefined
  let batchDepth = 0
  let effectsNeedScheduling = false
  const pendingEffects = new Set<() => void>()

  function scheduleEffects() {
    if (batchDepth !== 0 || !effectsNeedScheduling) return
    effectsNeedScheduling = false
    for (const effect of pendingEffects) scheduler.enqueueEffect(effect)
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
    const cell: Cell<T> = { value, version: 0, subscribers: new Set() }
    return {
      get() {
        track(cell as Cell<unknown>)
        return cell.value
      },
      get version() {
        return cell.version
      },
      set(next) {
        if (equals(cell.value, next)) return
        cell.value = next
        cell.version += 1
        notify(cell as Cell<unknown>)
      },
      update(updater) {
        this.set(updater(cell.value))
      },
    }
  }

  function computed<T>(
    calculate: () => T,
    equals: (left: T, right: T) => boolean = Object.is,
  ): ReadonlySignal<T> {
    const cell: Cell<T> = { value: undefined as T, version: 0, subscribers: new Set() }
    let dirty = true
    let evaluating = false
    let initialized = false
    const observer: Observer = {
      dependencies: new Set(),
      invalidate() {
        if (dirty) return
        dirty = true
        notify(cell as Cell<unknown>)
      },
    }

    function evaluate(): T {
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
        initialized = true
        dirty = false
        return cell.value
      } finally {
        currentObserver = previousObserver
        evaluating = false
      }
    }

    return {
      get() {
        track(cell as Cell<unknown>)
        return evaluate()
      },
      get version() {
        evaluate()
        return cell.version
      },
    }
  }

  function effect(run: () => void | (() => void)): EffectHandle {
    let active = true
    let cleanup: void | (() => void)
    const observer: Observer = {
      dependencies: new Set(),
      invalidate() {
        if (!active) return
        pendingEffects.add(execute)
        effectsNeedScheduling = true
      },
    }

    function execute() {
      if (!active) return
      pendingEffects.delete(execute)
      for (const dependency of observer.dependencies) dependency.subscribers.delete(observer)
      observer.dependencies.clear()
      cleanup?.()
      const previousObserver = currentObserver
      currentObserver = observer
      try {
        cleanup = run()
      } finally {
        currentObserver = previousObserver
      }
    }

    pendingEffects.add(execute)
    effectsNeedScheduling = true
    scheduleEffects()

    return {
      dispose() {
        if (!active) return
        active = false
        pendingEffects.delete(execute)
        for (const dependency of observer.dependencies) dependency.subscribers.delete(observer)
        observer.dependencies.clear()
        cleanup?.()
      },
    }
  }

  return {
    signal,
    computed,
    effect,
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
