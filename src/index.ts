// 背景として使う人向けの入口。計算部分を直接回したい人向けは particle-life-bg/sim (sim-api.ts)。
// ここに載せたものは semver で守る対象になるので、World の中身や属性の解析といった内部は出さない
export { type Controller, mount } from './mount.ts'
export {
  DEFAULTS,
  type Engine,
  type MatrixPreset,
  type Options,
  type SpawnContext,
  type SpawnFn,
} from './options.ts'
export { COLOR_SCHEMES, type ColorScheme, type SchemeName } from './palette.ts'
export { DRAW_STYLES, type DrawStyle } from './render.ts'
export {
  type Matrix,
  type Rng,
  randomMatrix,
  type SpawnPoint,
  seededRng,
  snakeMatrix,
  symmetricMatrix,
  zeroMatrix,
} from './sim.ts'
