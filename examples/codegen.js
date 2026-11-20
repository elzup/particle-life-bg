// playground の状態から「既定値と違うものだけ」を取り出し、貼り付けられるコードにする

/**
 * @typedef {{
 *   types: number, count: number, matrix: string | number[][], seed: number | undefined,
 *   rMax: number, friction: number, force: number, drawStyle: string[],
 *   scheme: string, background: string | undefined, fps: number
 * }} PlaygroundState
 */

export const BASE_DEFAULTS = {
  types: 5,
  count: 1500,
  rMax: 0.1,
  friction: 0.04,
  force: 10,
  fps: 30,
  scheme: 'rainbow',
  matrix: 'random',
}

// 行列を貼るときの桁数。2 桁で模様の見分けが付かなくなることはない
const MATRIX_DIGITS = 2

const round = (v) => Math.round(v * 10 ** MATRIX_DIGITS) / 10 ** MATRIX_DIGITS

/** 先頭から繰り返したときに元の列になる最短の周期 (ライブラリは足りない分を先頭から繰り返す) */
export const shortestPeriod = (list) => {
  for (let p = 1; p < list.length; p++) {
    if (list.every((v, i) => v === list[i % p])) return list.slice(0, p)
  }
  return list
}

/** @param {PlaygroundState} s */
export const toOptions = (s, d = BASE_DEFAULTS) => {
  const isCustomMatrix = Array.isArray(s.matrix)
  const styles = shortestPeriod(s.drawStyle.slice(0, s.types))
  const entries = [
    ['types', !isCustomMatrix && s.types !== d.types && s.types],
    ['count', s.count !== d.count && s.count],
    [
      'matrix',
      isCustomMatrix
        ? s.matrix.map((row) => row.map(round))
        : s.matrix !== d.matrix && s.matrix,
    ],
    ['seed', s.seed !== undefined && s.seed],
    ['rMax', s.rMax !== d.rMax && s.rMax],
    ['friction', s.friction !== d.friction && s.friction],
    ['force', s.force !== d.force && s.force],
    [
      'drawStyle',
      !(styles.length === 1 && styles[0] === 'dots') &&
        (styles.length === 1 ? styles[0] : styles),
    ],
    ['scheme', s.scheme !== d.scheme && s.scheme],
    ['background', s.background !== undefined && s.background],
    ['fps', s.fps !== d.fps && s.fps],
  ]

  return Object.fromEntries(entries.filter(([, v]) => v !== false))
}

const isMatrix = (v) => Array.isArray(v) && Array.isArray(v[0])

const literal = (v, indent) => {
  if (typeof v === 'string') return `'${v}'`
  if (!Array.isArray(v)) return String(v)
  if (!isMatrix(v)) return `[${v.map((x) => literal(x, indent)).join(', ')}]`
  const pad = ' '.repeat(indent + 2)
  const rows = v.map((row) => `${pad}[${row.join(', ')}],`).join('\n')

  return `[\n${rows}\n${' '.repeat(indent)}]`
}

export const toVanilla = (opts) => {
  const body = Object.entries(opts)
    .map(([k, v]) => `  ${k}: ${literal(v, 2)},`)
    .join('\n')
  const arg = body === '' ? '' : `, {\n${body}\n}`

  return [
    "import { mount } from 'particle-life-bg'",
    '',
    '// container は position: relative にしておく',
    `const bg = mount(document.querySelector('.hero')${arg})`,
  ].join('\n')
}

const prop = ([k, v]) =>
  typeof v === 'string' ? `${k}="${v}"` : `${k}={${literal(v, 4)}}`

export const toReact = (opts) => {
  const props = Object.entries(opts).map((e) => `    ${prop(e)}`)
  const tag =
    props.length === 0
      ? '  <ParticleLifeBg />'
      : `  <ParticleLifeBg\n${props.join('\n')}\n  />`

  return [
    "import { ParticleLifeBg } from 'particle-life-bg/react'",
    '',
    "<div style={{ position: 'relative' }}>",
    tag,
    '</div>',
  ].join('\n')
}

export const toJson = (opts) => JSON.stringify(opts, null, 2)

const escapeAttr = (v) => v.replaceAll('&', '&amp;').replaceAll('"', '&quot;')

/**
 * <particle-life-bg> の HTML。属性の対応表はライブラリ側 (toAttributes) が正本なので受け取って使う
 * @param {(o: object) => [string, string | null][]} toAttributes
 * @param {string} version CDN の URL に固定で埋める版 (@latest にすると貼った先の見た目が勝手に変わる)
 */
export const toHtml = (opts, toAttributes, version) => {
  const attrs = toAttributes(opts).map(([k, v]) =>
    v === null ? `  ${k}` : `  ${k}="${escapeAttr(v)}"`
  )
  const open =
    attrs.length === 0
      ? '<particle-life-bg>'
      : `<particle-life-bg\n${attrs.join('\n')}\n>`

  return [
    `<script type="module" src="https://cdn.jsdelivr.net/npm/particle-life-bg@${version}/lib/esm/element.js"></script>`,
    '',
    `${open}\n  <h1>Hello</h1>\n</particle-life-bg>`,
  ].join('\n')
}
