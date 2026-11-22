// mount を Node で動かすための最小の DOM。happy-dom 等は canvas の 2D 描画を持たないので自前で用意する。
// requestAnimationFrame と各 Observer はテストから手で進める (実時間に依らず決定的にするため)

type Call = { name: string; args: unknown[] }

const WIDTH = 320
const HEIGHT = 180

// 呼ばれたメソッドを全部記録する 2D context。描画の中身は見ず、記録の差で「動いたか」を判定する
const fakeContext = (log: Call[]) => {
  const gradient = { addColorStop: () => {} }
  const props: Record<string | symbol, unknown> = {}

  return new Proxy(props, {
    get: (t, key) =>
      key in t
        ? t[key]
        : (...args: unknown[]) => {
            log.push({ name: String(key), args })
            return gradient
          },
    set: (t, key, value) => {
      t[key] = value
      return true
    },
  })
}

class FakeElement {
  style: Record<string, string> = {}
  attributes = new Map<string, string>()
  children: FakeElement[] = []
  parent: FakeElement | null = null
  setAttribute(k: string, v: string) {
    this.attributes.set(k, v)
  }
  prepend(child: FakeElement) {
    child.parent = this
    this.children = [child, ...this.children]
  }
  remove() {
    if (this.parent === null) return
    const parent = this.parent

    parent.children = parent.children.filter((c) => c !== this)
    this.parent = null
  }
}

class FakeCanvas extends FakeElement {
  width = 300
  height = 150
  log: Call[] = []
  rect = { width: WIDTH, height: HEIGHT }
  private ctx = fakeContext(this.log)
  getContext() {
    return this.ctx
  }
  getBoundingClientRect() {
    return this.rect
  }
}

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void

export const installFakeDom = () => {
  let nextFrameId = 1
  const frames = new Map<number, (now: number) => void>()
  const resizeObservers = new Set<{ cb: () => void; active: boolean }>()
  const intersectionObservers = new Set<{
    cb: ObserverCallback
    active: boolean
  }>()
  const docListeners = new Map<string, Set<() => void>>()
  const motionListeners = new Set<() => void>()
  const motion = { matches: false }

  const g = globalThis as Record<string, unknown>

  g.HTMLCanvasElement = FakeCanvas
  g.window = {
    devicePixelRatio: 1,
    matchMedia: () => ({
      get matches() {
        return motion.matches
      },
      addEventListener: (_: string, f: () => void) => motionListeners.add(f),
      removeEventListener: (_: string, f: () => void) =>
        motionListeners.delete(f),
    }),
  }
  g.document = {
    hidden: false,
    createElement: (tag: string) =>
      tag === 'canvas' ? new FakeCanvas() : new FakeElement(),
    addEventListener: (type: string, f: () => void) => {
      const set = docListeners.get(type) ?? new Set()

      set.add(f)
      docListeners.set(type, set)
    },
    removeEventListener: (type: string, f: () => void) =>
      docListeners.get(type)?.delete(f),
  }
  g.requestAnimationFrame = (cb: (now: number) => void) => {
    const id = nextFrameId++

    frames.set(id, cb)
    return id
  }
  g.cancelAnimationFrame = (id: number) => frames.delete(id)
  g.ResizeObserver = class {
    private entry
    constructor(cb: () => void) {
      this.entry = { cb, active: false }
      resizeObservers.add(this.entry)
    }
    observe() {
      this.entry.active = true
    }
    disconnect() {
      this.entry.active = false
    }
  }
  g.IntersectionObserver = class {
    private entry
    constructor(cb: ObserverCallback) {
      this.entry = { cb, active: false }
      intersectionObservers.add(this.entry)
    }
    observe() {
      this.entry.active = true
    }
    disconnect() {
      this.entry.active = false
    }
  }

  return {
    FakeCanvas,
    FakeElement,
    motion,
    /** 待っている rAF を全部 now で呼ぶ */
    frame: (now: number) => {
      const due = [...frames.entries()]

      frames.clear()
      for (const [, cb] of due) cb(now)
    },
    pendingFrames: () => frames.size,
    resize: () => {
      for (const o of resizeObservers) if (o.active) o.cb()
    },
    intersect: (isIntersecting: boolean) => {
      for (const o of intersectionObservers)
        if (o.active) o.cb([{ isIntersecting }])
    },
    setHidden: (hidden: boolean) => {
      ;(g.document as { hidden: boolean }).hidden = hidden
      for (const f of docListeners.get('visibilitychange') ?? []) f()
    },
    setReducedMotion: (matches: boolean) => {
      motion.matches = matches
      for (const f of motionListeners) f()
    },
    activeObservers: () =>
      [...resizeObservers, ...intersectionObservers].filter((o) => o.active)
        .length,
    docListenerCount: () =>
      [...docListeners.values()].reduce((n, s) => n + s.size, 0),
    motionListenerCount: () => motionListeners.size,
  }
}

export type FakeDom = ReturnType<typeof installFakeDom>
export type FakeCanvasInstance = InstanceType<FakeDom['FakeCanvas']>

/** canvas の描画記録を取り出して空にする。毎フレームの描き方が同じなら同じ文字列になる */
export const takeFrame = (canvas: FakeCanvasInstance) =>
  JSON.stringify(canvas.log.splice(0), (_, v) =>
    typeof v === 'object' && v !== null && !Array.isArray(v) && !('name' in v)
      ? '[obj]'
      : v
  )

/** 背景を塗った回数 = draw した回数 */
export const countDraws = (canvas: FakeCanvasInstance) =>
  canvas.log.filter(
    (c) =>
      c.name === 'fillRect' &&
      c.args[0] === 0 &&
      c.args[1] === 0 &&
      c.args[2] === canvas.rect.width &&
      c.args[3] === canvas.rect.height
  ).length
