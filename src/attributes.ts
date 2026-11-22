// custom element の属性 ↔ Options の対応表。解析・コード生成・README の options 表はすべてこの 1 枚から作る
import type { MatrixPreset, Options } from './options.ts'
import type { SchemeName } from './palette.ts'
import { DRAW_STYLES, type DrawStyle } from './render.ts'
import type { Matrix } from './sim.ts'

type Kind = 'number' | 'boolean' | 'string' | 'styles' | 'colors' | 'matrix'

export type AttributeSpec = {
  /** HTML 属性名 (kebab-case) */
  attr: string
  key: keyof Options
  kind: Kind
}

export const ATTRIBUTES: readonly AttributeSpec[] = [
  { attr: 'types', key: 'types', kind: 'number' },
  { attr: 'count', key: 'count', kind: 'number' },
  { attr: 'matrix', key: 'matrix', kind: 'matrix' },
  { attr: 'seed', key: 'seed', kind: 'number' },
  { attr: 'r-max', key: 'rMax', kind: 'number' },
  { attr: 'friction', key: 'friction', kind: 'number' },
  { attr: 'force', key: 'force', kind: 'number' },
  { attr: 'draw-style', key: 'drawStyle', kind: 'styles' },
  { attr: 'scheme', key: 'scheme', kind: 'string' },
  { attr: 'colors', key: 'colors', kind: 'colors' },
  { attr: 'background', key: 'background', kind: 'string' },
  { attr: 'fps', key: 'fps', kind: 'number' },
  { attr: 'max-pixel-ratio', key: 'maxPixelRatio', kind: 'number' },
  { attr: 'paused', key: 'paused', kind: 'boolean' },
  { attr: 'pause-when-hidden', key: 'pauseWhenHidden', kind: 'boolean' },
  {
    attr: 'respect-reduced-motion',
    key: 'respectReducedMotion',
    kind: 'boolean',
  },
  { attr: 'engine', key: 'engine', kind: 'string' },
]

const MATRIX_PRESETS: readonly string[] = [
  'random',
  'symmetric',
  'snake',
  'zero',
] satisfies MatrixPreset[]

const isDrawStyle = (s: string): s is DrawStyle =>
  (DRAW_STYLES as readonly string[]).includes(s)

const isMatrix = (v: unknown): v is Matrix =>
  Array.isArray(v) &&
  v.every(
    (row) =>
      Array.isArray(row) &&
      row.length === v.length &&
      row.every((x) => typeof x === 'number' && Number.isFinite(x))
  )

const parseMatrix = (raw: string): Matrix | MatrixPreset | undefined => {
  const text = raw.trim()
  if (MATRIX_PRESETS.includes(text)) return text as MatrixPreset
  try {
    const v: unknown = JSON.parse(text)
    if (isMatrix(v)) return v
  } catch {
    // 下の警告に集約する (JSON の構文エラーも形の不一致も、利用者に伝えることは同じ)
  }
  console.warn(`particle-life-bg: matrix 属性を読めないので無視する: ${raw}`)
  return undefined
}

/** 属性値 1 つを Options の値にする。null (属性なし) と読めない値は undefined = 既定値 */
export const parseAttribute = (
  kind: Kind,
  raw: string | null
): Options[keyof Options] | undefined => {
  if (raw === null) return undefined
  if (kind === 'boolean') return raw !== 'false'
  if (kind === 'number') {
    const n = Number(raw)
    return raw.trim() === '' || !Number.isFinite(n) ? undefined : n
  }
  if (kind === 'styles') {
    const list = raw.split(/[\s,]+/).filter(isDrawStyle)
    return list.length === 0 ? undefined : list
  }
  // 色は rgb(…) のように中に空白やカンマを含みうるので、区切りは空白のみ・括弧の中は割らない
  if (kind === 'colors') {
    const list = raw.match(/[^\s(]+(\([^)]*\))?/g) ?? []
    return list.length === 0 ? undefined : list
  }
  if (kind === 'matrix') return parseMatrix(raw)
  // string の属性は scheme と engine。どちらも resolveOptions が知らない値を既定に戻す
  return raw as SchemeName
}

/** element の getAttribute から Options を組み立てる */
export const readAttributes = (
  get: (attr: string) => string | null
): Options => {
  const entries = ATTRIBUTES.map(
    (s) => [s.key, parseAttribute(s.kind, get(s.attr))] as const
  ).filter(([, v]) => v !== undefined)

  return Object.fromEntries(entries) as Options
}

const formatValue = (kind: Kind, v: unknown): string | null => {
  if (kind === 'boolean') return v === true ? null : 'false'
  if (kind === 'styles' || kind === 'colors') return [v].flat().join(' ')
  if (kind === 'matrix') return typeof v === 'string' ? v : JSON.stringify(v)
  return String(v)
}

/**
 * Options を属性の組にする (コード生成用)。値が null の属性は値なしで書く (`paused`)。
 * 属性で表せない値 (ColorScheme オブジェクト) は落とす
 */
export const toAttributes = (o: Options): [string, string | null][] =>
  ATTRIBUTES.flatMap((s) => {
    const v = o[s.key]
    if (v === undefined) return []
    if (s.key === 'scheme' && typeof v !== 'string') return []
    return [[s.attr, formatValue(s.kind, v)]]
  })
