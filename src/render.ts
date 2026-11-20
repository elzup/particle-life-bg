import { type ColorScheme, toRgb } from './palette.ts'
import type { World } from './sim.ts'

// 種類 (色) ごとに描き方を選べる canvas 描画。シミュレーションとは独立で、描くだけ

export const DRAW_STYLES = [
  'dots',
  'glow',
  'trail',
  'streak',
  'links',
  'mono',
  'speedGlow',
  'crowdGlow',
] as const
export type DrawStyle = (typeof DRAW_STYLES)[number]

const DOT = 2
const SPRITE = 28
// 残像レイヤーを 1 フレームで消す割合。小さいほど尾が長い
const TRAIL_FADE = 0.14
// 速度 (空間の高さ/秒) を何秒ぶんの線にするか
const STREAK_SECONDS = 0.06
// 近傍を結ぶ距離 (rMax 比)。rMax そのままだと線で埋まって構造が見えない
const LINK_RATIO = 0.45
// これ以上の速さ (空間の高さ/秒) で最大の明るさ。既定パラメータ・1500 粒子の実測で中央値 0.05、上位 10% が 0.37 なので、速い 1 割だけが強く光る値にする
const SPEED_FULL = 0.3
// これ以上の近傍数で最大の明るさ。同条件の実測で中央値 75、上位 10% が 350 (塊の芯)
const CROWD_FULL = 300
// 明るさ 0 でも位置が分かるよう、暗い芯は常に描く
const DIM_ALPHA = 0.25
// これより暗い光はスプライトを描いても見えないので省く (drawImage が描画コストの大半)
const MIN_GLOW_ALPHA = 0.05

export type DrawArgs = {
  world: World
  typeCount: number
  styles: readonly DrawStyle[]
  rMax: number
  scheme: ColorScheme
  /** 地の色。null なら透明 (下の要素が透ける) */
  background: string | null
}

/** CSS px での描画領域。pixelRatio は canvas の実解像度との比 */
export type Viewport = { width: number; height: number; pixelRatio: number }

const makeSprite = (color: string): HTMLCanvasElement => {
  const c = document.createElement('canvas')

  c.width = SPRITE
  c.height = SPRITE
  const g = c.getContext('2d')

  if (!g) return c
  const [r, gr, b] = toRgb(g, color)
  const mid = SPRITE / 2
  const grad = g.createRadialGradient(mid, mid, 0, mid, mid, mid)
  // 芯は白に寄せて「光っている」感じを出し、外側は元の色で減衰させる
  const core = (v: number) => Math.round(v + (255 - v) * 0.6)

  grad.addColorStop(0, `rgba(${core(r)}, ${core(gr)}, ${core(b)}, 0.95)`)
  grad.addColorStop(0.18, `rgba(${r}, ${gr}, ${b}, 0.55)`)
  grad.addColorStop(1, `rgba(${r}, ${gr}, ${b}, 0)`)
  g.fillStyle = grad
  g.fillRect(0, 0, SPRITE, SPRITE)
  return c
}

// 明るい地に加算合成すると白飛びして消えるので、通常合成に落とす
const blend = (scheme: ColorScheme): GlobalCompositeOperation =>
  scheme.isLight ? 'source-over' : 'lighter'

type Pass = (g: CanvasRenderingContext2D, args: DrawArgs, t: number) => void

const createPasses = (
  scaleOf: () => number,
  sprite: (color: string) => HTMLCanvasElement
): Record<DrawStyle, Pass> => {
  // 空間の高さ 1 を CSS px の高さに合わせる (幅は World.width が縦横比なので同じ倍率で埋まる)
  const eachOfType = (
    world: World,
    t: number,
    fn: (x: number, y: number, i: number) => void
  ) => {
    const s = scaleOf()

    for (let i = 0; i < world.count; i++) {
      if (world.types[i] === t)
        fn((world.x[i] ?? 0) * s, (world.y[i] ?? 0) * s, i)
    }
  }

  const dots: Pass = (g, { world, typeCount, scheme }, t) => {
    g.fillStyle = scheme.color(t, typeCount)
    eachOfType(world, t, (x, y) =>
      g.fillRect(x - DOT / 2, y - DOT / 2, DOT, DOT)
    )
  }

  // level(i) が 1 に近いほど強く光る。0 付近は暗い点だけ
  const intensityGlow = (
    g: CanvasRenderingContext2D,
    { world, typeCount, scheme }: DrawArgs,
    t: number,
    level: (i: number) => number
  ) => {
    const sp = sprite(scheme.color(t, typeCount))

    g.fillStyle = scheme.color(t, typeCount)
    g.globalCompositeOperation = blend(scheme)
    eachOfType(world, t, (x, y, i) => {
      const a = Math.min(1, level(i))

      g.globalAlpha = DIM_ALPHA
      g.fillRect(x - DOT / 2, y - DOT / 2, DOT, DOT)
      if (a < MIN_GLOW_ALPHA) return
      g.globalAlpha = a
      g.drawImage(sp, x - SPRITE / 2, y - SPRITE / 2)
    })
    g.globalAlpha = 1
    g.globalCompositeOperation = 'source-over'
  }

  return {
    dots,
    trail: dots,
    glow: (g, { world, typeCount, scheme }, t) => {
      const sp = sprite(scheme.color(t, typeCount))

      g.globalCompositeOperation = blend(scheme)
      eachOfType(world, t, (x, y) =>
        g.drawImage(sp, x - SPRITE / 2, y - SPRITE / 2)
      )
      g.globalCompositeOperation = 'source-over'
    },
    streak: (g, { world, typeCount, scheme }, t) => {
      const k = STREAK_SECONDS * scaleOf()

      g.strokeStyle = scheme.color(t, typeCount)
      g.lineWidth = 1.6
      g.lineCap = 'round'
      g.beginPath()
      eachOfType(world, t, (x, y, i) => {
        g.moveTo(x, y)
        g.lineTo(x - (world.vx[i] ?? 0) * k, y - (world.vy[i] ?? 0) * k)
      })
      g.stroke()
    },
    links: (g, { world, typeCount, rMax, scheme }, t) => {
      const xs: number[] = []
      const ys: number[] = []

      eachOfType(world, t, (x, y) => {
        xs.push(x)
        ys.push(y)
      })
      const l2 = (rMax * scaleOf() * LINK_RATIO) ** 2

      g.strokeStyle = scheme.color(t, typeCount)
      g.lineWidth = 0.8
      g.globalAlpha = 0.5
      g.beginPath()
      for (let i = 0; i < xs.length; i++) {
        const xi = xs[i] ?? 0
        const yi = ys[i] ?? 0

        for (let j = i + 1; j < xs.length; j++) {
          const dx = (xs[j] ?? 0) - xi
          const dy = (ys[j] ?? 0) - yi

          if (dx * dx + dy * dy >= l2) continue
          g.moveTo(xi, yi)
          g.lineTo(xi + dx, yi + dy)
        }
      }
      g.stroke()
      g.globalAlpha = 1
      g.fillStyle = scheme.color(t, typeCount)
      for (let i = 0; i < xs.length; i++)
        g.fillRect((xs[i] ?? 0) - 1, (ys[i] ?? 0) - 1, 2, 2)
    },
    speedGlow: (g, args, t) =>
      intensityGlow(
        g,
        args,
        t,
        (i) =>
          Math.hypot(args.world.vx[i] ?? 0, args.world.vy[i] ?? 0) / SPEED_FULL
      ),
    crowdGlow: (g, args, t) =>
      intensityGlow(g, args, t, (i) => (args.world.near[i] ?? 0) / CROWD_FULL),
    mono: (g, { world, scheme }, t) => {
      g.fillStyle = scheme.fg
      g.globalAlpha = 0.18 + 0.05 * (t % 4)
      eachOfType(world, t, (x, y) =>
        g.fillRect(x - DOT / 2, y - DOT / 2, DOT, DOT)
      )
      g.globalAlpha = 1
    },
  }
}

export type Renderer = {
  draw: (args: DrawArgs) => void
  resize: (viewport: Viewport) => void
}

const fitCanvas = (c: HTMLCanvasElement, v: Viewport) => {
  c.width = Math.max(1, Math.round(v.width * v.pixelRatio))
  c.height = Math.max(1, Math.round(v.height * v.pixelRatio))
}

export const createRenderer = (
  canvas: HTMLCanvasElement,
  initial: Viewport
): Renderer => {
  const ctx = canvas.getContext('2d')

  if (!ctx) throw new Error('particle-life-bg: 2d context is not available')
  let viewport = initial
  const sprites = new Map<string, HTMLCanvasElement>()
  const sprite = (color: string) => {
    const cached = sprites.get(color)

    if (cached) return cached
    const made = makeSprite(color)

    sprites.set(color, made)
    return made
  }
  const passes = createPasses(() => viewport.height, sprite)
  // 残像は画面全体を薄めると他の種類まで尾を引くので、残像の種類だけ別レイヤーに描いて薄める
  const layer = document.createElement('canvas')
  const lg = layer.getContext('2d')

  const resize = (v: Viewport) => {
    viewport = v
    fitCanvas(canvas, v)
    fitCanvas(layer, v)
    // canvas の大きさを変えると transform も初期化されるので毎回掛け直す
    ctx.setTransform(v.pixelRatio, 0, 0, v.pixelRatio, 0, 0)
    lg?.setTransform(v.pixelRatio, 0, 0, v.pixelRatio, 0, 0)
  }

  const drawTrailLayer = (args: DrawArgs) => {
    if (!lg) return
    const { width, height } = viewport

    lg.globalCompositeOperation = 'destination-out'
    lg.globalAlpha = TRAIL_FADE
    lg.fillRect(0, 0, width, height)
    lg.globalCompositeOperation = 'source-over'
    lg.globalAlpha = 1
    args.styles.forEach((s, t) => {
      if (s === 'trail' && t < args.typeCount) passes.trail(lg, args, t)
    })
    ctx.drawImage(layer, 0, 0, width, height)
  }

  resize(initial)

  return {
    resize,
    draw: (args) => {
      const { width, height } = viewport

      if (args.background === null) {
        ctx.clearRect(0, 0, width, height)
      } else {
        ctx.fillStyle = args.background
        ctx.fillRect(0, 0, width, height)
      }
      if (args.styles.slice(0, args.typeCount).includes('trail')) {
        drawTrailLayer(args)
      } else {
        lg?.clearRect(0, 0, width, height)
      }
      for (let t = 0; t < args.typeCount; t++) {
        const style = args.styles[t] ?? 'dots'

        if (style !== 'trail') passes[style](ctx, args, t)
      }
    },
  }
}
