export {
  ATTRIBUTES,
  type AttributeSpec,
  parseAttribute,
  readAttributes,
  toAttributes,
} from './attributes.ts'
export { type Controller, mount } from './mount.ts'
export {
  DEFAULTS,
  type MatrixPreset,
  type Options,
  resolveOptions,
} from './options.ts'
export { COLOR_SCHEMES, type ColorScheme, type SchemeName } from './palette.ts'
export { DRAW_STYLES, type DrawStyle } from './render.ts'
export {
  createWorld,
  force,
  type Matrix,
  type Params,
  randomMatrix,
  seededRng,
  snakeMatrix,
  step,
  symmetricMatrix,
  type World,
  zeroMatrix,
} from './sim.ts'
