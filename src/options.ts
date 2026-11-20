import { COLOR_SCHEMES, type ColorScheme, type SchemeName } from './palette.ts'
import type { DrawStyle } from './render.ts'
import {
  type Matrix,
  type Params,
  type Rng,
  randomMatrix,
  seededRng,
  snakeMatrix,
  symmetricMatrix,
  zeroMatrix,
} from './sim.ts'

export type MatrixPreset = 'random' | 'symmetric' | 'snake' | 'zero'

export type Options = {
  /** 粒子の種類数 (matrix に配列を渡したときはその大きさが優先) */
  types?: number
  /** 粒子数。計算量は粒子数 × 近傍数で、画面の大きさには依らない */
  count?: number
  /** 引力行列。matrix[i][j] は種類 i が j に引かれる強さ (-1〜1) */
  matrix?: Matrix | MatrixPreset
  /** 乱数の種。指定すると行列と初期配置が毎回同じになる */
  seed?: number
  /** 相互作用が届く距離 (要素の高さ 1 に対する比) */
  rMax?: number
  /** 速度が半分になるまでの秒数 */
  friction?: number
  /** 力の倍率 */
  force?: number
  /** 描き方。配列なら種類ごと (足りない分は先頭から繰り返す) */
  drawStyle?: DrawStyle | readonly DrawStyle[]
  /** 配色。名前か ColorScheme を直接 */
  scheme?: SchemeName | ColorScheme
  /** 地の色。'transparent' で下の要素を透かす。既定は配色の地 */
  background?: string
  /** 1 秒あたりのシミュレーション回数。背景なら 30 程度に落としても見た目はほぼ変わらない */
  fps?: number
  /** canvas の解像度倍率の上限。高 DPI で 3 倍にすると塗りが 9 倍になるので抑える */
  maxPixelRatio?: number
  paused?: boolean
  /** 画面外にある間・タブが非表示の間は止める */
  pauseWhenHidden?: boolean
  /** OS の「視差効果を減らす」設定のとき、動かさず 1 枚絵として描く */
  respectReducedMotion?: boolean
}

export type Resolved = {
  types: number
  count: number
  matrix: Matrix
  seed: number | undefined
  params: Params
  styles: DrawStyle[]
  scheme: ColorScheme
  background: string | null
  fps: number
  maxPixelRatio: number
  paused: boolean
  pauseWhenHidden: boolean
  respectReducedMotion: boolean
}

export const DEFAULTS = {
  types: 6,
  count: 1500,
  rMax: 0.1,
  friction: 0.04,
  force: 10,
  fps: 60,
  maxPixelRatio: 2,
} as const

// Uint8Array に種類番号を入れるので 255 種まで。実用上は 10 前後で色の見分けが限界
const MAX_TYPES = 255

const clampInt = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(v)))

const presetMatrix = (preset: MatrixPreset, n: number, rng: Rng): Matrix => {
  if (preset === 'symmetric') return symmetricMatrix(n, rng)
  if (preset === 'snake') return snakeMatrix(n)
  if (preset === 'zero') return zeroMatrix(n)
  return randomMatrix(n, rng)
}

const resolveStyles = (
  style: Options['drawStyle'],
  types: number
): DrawStyle[] => {
  const list: readonly DrawStyle[] =
    style === undefined ? ['dots'] : typeof style === 'string' ? [style] : style

  if (list.length === 0) return Array(types).fill('dots')
  return Array.from(
    { length: types },
    (_, i) => list[i % list.length] ?? 'dots'
  )
}

const resolveScheme = (scheme: Options['scheme']): ColorScheme => {
  if (scheme === undefined) return COLOR_SCHEMES.rainbow
  if (typeof scheme !== 'string') return scheme
  return COLOR_SCHEMES[scheme] ?? COLOR_SCHEMES.rainbow
}

export const resolveOptions = (
  o: Options,
  rng: Rng = o.seed === undefined ? Math.random : seededRng(o.seed)
): Resolved => {
  const explicit = Array.isArray(o.matrix) ? o.matrix : null
  const types = clampInt(
    explicit?.length ?? o.types ?? DEFAULTS.types,
    1,
    MAX_TYPES
  )
  const preset = typeof o.matrix === 'string' ? o.matrix : 'random'
  const scheme = resolveScheme(o.scheme)

  return {
    types,
    count: clampInt(o.count ?? DEFAULTS.count, 0, 65535),
    matrix: explicit ?? presetMatrix(preset, types, rng),
    seed: o.seed,
    params: {
      rMax: o.rMax ?? DEFAULTS.rMax,
      frictionHalfLife: o.friction ?? DEFAULTS.friction,
      forceFactor: o.force ?? DEFAULTS.force,
    },
    styles: resolveStyles(o.drawStyle, types),
    scheme,
    background:
      o.background === 'transparent' ? null : (o.background ?? scheme.bg),
    fps: Math.max(1, o.fps ?? DEFAULTS.fps),
    maxPixelRatio: Math.max(0.5, o.maxPixelRatio ?? DEFAULTS.maxPixelRatio),
    paused: o.paused ?? false,
    pauseWhenHidden: o.pauseWhenHidden ?? true,
    respectReducedMotion: o.respectReducedMotion ?? true,
  }
}

const sameMatrix = (a: Matrix | string | undefined, b: typeof a) => {
  if (a === b) return true
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
    return false
  return a.every((row, i) => row.every((v, j) => v === b[i]?.[j]))
}

/**
 * 前回と今回の options を比べ、作り直しが要るものを返す。
 * React で毎レンダー新しいオブジェクトが渡っても、値が同じなら模様を壊さないため。
 */
export const diffOptions = (prev: Options, next: Options) => {
  const typesChanged =
    (Array.isArray(next.matrix) ? next.matrix.length : next.types) !==
    (Array.isArray(prev.matrix) ? prev.matrix.length : prev.types)
  const seedChanged = prev.seed !== next.seed

  return {
    respawn: typesChanged || seedChanged || prev.count !== next.count,
    rematrix:
      typesChanged || seedChanged || !sameMatrix(prev.matrix, next.matrix),
  }
}
