import {
  diffOptions,
  type Options,
  type Resolved,
  resolveOptions,
} from './options.ts'
import { createRenderer, type Viewport } from './render.ts'
import {
  createWorld,
  type Matrix,
  randomMatrix,
  resizeWorld,
  seededRng,
  step,
  type World,
} from './sim.ts'

// 実時間ではなく固定刻みで進める。タブ復帰時などに dt が跳ねると粒子が吹き飛ぶため
const SIM_DT = 0.02
// reduced motion のとき、乱雑な初期配置ではなく構造ができた状態を 1 枚絵にするための助走ステップ数
const STILL_WARMUP_STEPS = 200

export type Controller = {
  readonly canvas: HTMLCanvasElement
  /** 既定 (merge) は渡した分だけ変え、残りは前回の値を引き継ぐ。replace は渡したものだけを全体とみなす */
  setOptions: (patch: Options, mode?: 'merge' | 'replace') => void
  pause: () => void
  resume: () => void
  /** 引力行列をランダムに引き直す (seed に依らない) */
  shuffle: () => void
  /** 粒子を撒き直す */
  respawn: () => void
  readonly matrix: Matrix
  destroy: () => void
}

const OVERLAY_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'absolute',
  inset: '0',
  width: '100%',
  height: '100%',
  display: 'block',
  pointerEvents: 'none',
}

// div などを渡されたら中に canvas を敷く。canvas を渡されたらそれに描く (React 側はこちら)
const ensureCanvas = (target: HTMLElement) => {
  if (target instanceof HTMLCanvasElement)
    return { canvas: target, owned: false }
  const canvas = document.createElement('canvas')

  Object.assign(canvas.style, OVERLAY_STYLE)
  canvas.setAttribute('aria-hidden', 'true')
  target.prepend(canvas)
  return { canvas, owned: true }
}

const readViewport = (
  canvas: HTMLCanvasElement,
  maxRatio: number
): Viewport => {
  const rect = canvas.getBoundingClientRect()

  return {
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height),
    pixelRatio: Math.min(maxRatio, window.devicePixelRatio || 1),
  }
}

const spawn = (r: Resolved, width: number): World =>
  createWorld(
    r.count,
    r.types,
    width,
    // 行列と同じ乱数列を使うと配置が行列に引きずられるので種をずらす
    r.seed === undefined ? Math.random : seededRng(r.seed + 1)
  )

const reducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** target に Particle Life の背景を描き始める */
export const mount = (
  target: HTMLElement,
  options: Options = {}
): Controller => {
  const { canvas, owned } = ensureCanvas(target)
  let input: Options = { ...options }
  let cfg = resolveOptions(input)
  let viewport = readViewport(canvas, cfg.maxPixelRatio)
  const renderer = createRenderer(canvas, viewport)
  let world = spawn(cfg, viewport.width / viewport.height)
  let isVisible = true
  let raf = 0
  let lastStepAt = 0
  let isDestroyed = false

  const isStill = () => cfg.respectReducedMotion && reducedMotion()
  const isRunning = () =>
    !isDestroyed &&
    !cfg.paused &&
    !isStill() &&
    (!cfg.pauseWhenHidden || isVisible)

  const draw = () =>
    renderer.draw({
      world,
      typeCount: cfg.types,
      styles: cfg.styles,
      rMax: cfg.params.rMax,
      scheme: cfg.scheme,
      background: cfg.background,
    })

  const drawStill = () => {
    for (let k = 0; k < STILL_WARMUP_STEPS; k++)
      step(world, cfg.matrix, cfg.params, SIM_DT)
    draw()
  }

  // fps より速く rAF が来たら何もしない。描画もシミュレーションに合わせて間引くと、そのぶん CPU も GPU も休める
  const loop = (now: number) => {
    raf = 0
    if (!isRunning()) return
    raf = requestAnimationFrame(loop)
    if (now - lastStepAt < 1000 / cfg.fps - 1) return
    lastStepAt = now
    step(world, cfg.matrix, cfg.params, SIM_DT)
    draw()
  }

  const sync = () => {
    if (isRunning()) {
      if (raf === 0) raf = requestAnimationFrame(loop)
      return
    }
    if (raf !== 0) cancelAnimationFrame(raf)
    raf = 0
    if (!isDestroyed && isStill()) drawStill()
  }

  const onResize = () => {
    viewport = readViewport(canvas, cfg.maxPixelRatio)
    renderer.resize(viewport)
    resizeWorld(world, viewport.width / viewport.height)
    // 止まっている間も大きさが変わったら描き直さないと、引き伸ばされた古い絵が残る
    if (!isRunning()) draw()
  }
  const resizeObserver = new ResizeObserver(onResize)
  const intersection = new IntersectionObserver((entries) => {
    isVisible = entries.some((e) => e.isIntersecting) && !document.hidden
    sync()
  })
  const onVisibility = () => {
    isVisible = !document.hidden
    sync()
  }
  const motionQuery =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null

  resizeObserver.observe(canvas)
  intersection.observe(canvas)
  document.addEventListener('visibilitychange', onVisibility)
  motionQuery?.addEventListener('change', sync)

  const setOptions = (patch: Options, mode: 'merge' | 'replace' = 'merge') => {
    const next = mode === 'replace' ? { ...patch } : { ...input, ...patch }
    const { respawn, rematrix } = diffOptions(input, next)
    const resolved = resolveOptions(next)

    input = next
    cfg = rematrix ? resolved : { ...resolved, matrix: cfg.matrix }
    if (respawn) world = spawn(cfg, viewport.width / viewport.height)
    if (!isRunning()) draw()
    sync()
  }

  draw()
  sync()

  return {
    canvas,
    get matrix() {
      return cfg.matrix
    },
    setOptions,
    pause: () => setOptions({ paused: true }),
    resume: () => setOptions({ paused: false }),
    shuffle: () => {
      cfg = { ...cfg, matrix: randomMatrix(cfg.types) }
    },
    respawn: () => {
      world = spawn(cfg, viewport.width / viewport.height)
    },
    destroy: () => {
      isDestroyed = true
      sync()
      resizeObserver.disconnect()
      intersection.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      motionQuery?.removeEventListener('change', sync)
      if (owned) canvas.remove()
    },
  }
}
