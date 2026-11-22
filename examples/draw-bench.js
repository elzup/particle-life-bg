// 描画だけの比較。描き方 8 種 × 粒子数で、Canvas 2D の 1 フレームの時間を測る (ブラウザ専用)。
// 計算ベンチと同じ条件の粒子を、塊ができるまで進めてから描く (ばらけた初期配置は実運用より描画も軽い)

import { COLOR_SCHEMES, DRAW_STYLES } from '../lib/esm/index.js'
import { createRenderer } from '../lib/esm/render.js'

const SEED = 42
const TYPES = 5
const PARAMS = { rMax: 0.1, frictionHalfLife: 0.04, forceFactor: 10 }
const DT = 0.02
const SETTLE_STEPS = 120
// 背景としていちばん多いと見込む 16:9 のデスクトップ画面 (CSS px)
export const VIEWPORT = { width: 1440, height: 810 }
const WARMUP_FRAMES = 10
const MEASURE_FRAMES = 40

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/**
 * canvas の命令は GPU 側で遅れて実行されるので、1px 読み戻して描き終わるまで待たせた時間も測る。
 * submit = JS が命令を積むのに掛かった時間、flush = GPU 側の実行まで含めた時間
 */
const timeFrames = (draw, ctx) => {
  for (let k = 0; k < WARMUP_FRAMES; k++) {
    draw()
    ctx.getImageData(0, 0, 1, 1)
  }
  const submit = []
  const flush = []
  for (let k = 0; k < MEASURE_FRAMES; k++) {
    const t0 = performance.now()
    draw()
    const t1 = performance.now()
    ctx.getImageData(0, 0, 1, 1)
    const t2 = performance.now()
    submit.push(t1 - t0)
    flush.push(t2 - t0)
  }
  return { submit: median(submit), flush: median(flush) }
}

/**
 * @param {typeof import('../src/sim-api.ts')} lib
 * @param {HTMLCanvasElement} canvas
 * @param {number[]} counts
 * @param {(msg: string) => void} onProgress
 */
export const runDrawBench = async (lib, canvas, counts, onProgress) => {
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1)
  const viewport = { ...VIEWPORT, pixelRatio }
  const renderer = createRenderer(canvas, viewport)
  const ctx = canvas.getContext('2d')
  const scheme = COLOR_SCHEMES.rainbow
  const rows = []

  for (const count of counts) {
    const matrix = lib.randomMatrix(TYPES, lib.seededRng(SEED))
    const world = lib.createWorld(
      count,
      TYPES,
      VIEWPORT.width / VIEWPORT.height,
      lib.seededRng(SEED + 1)
    )
    for (let k = 0; k < SETTLE_STEPS; k++) lib.step(world, matrix, PARAMS, DT)

    const cells = []
    for (const style of DRAW_STYLES) {
      onProgress(`${count} 粒子 / ${style}`)
      // 計測の合間に画面を更新させる (固まったように見えないため)
      await new Promise((r) => setTimeout(r, 0))
      const args = {
        world,
        typeCount: TYPES,
        styles: Array(TYPES).fill(style),
        rMax: PARAMS.rMax,
        scheme,
        background: scheme.bg,
      }
      cells.push({ style, ...timeFrames(() => renderer.draw(args), ctx) })
    }
    rows.push({ count, cells })
  }
  return { pixelRatio, rows }
}
