// particle-life-bg/sim: 描画を自前で持つ人向けに、計算部分 (World と step) を直接出す入口。
// 行列の生成は main の入口と同じものをここからも引けるようにする (両方 import させないため)
export {
  BETA,
  createWorld,
  force,
  type Matrix,
  type Params,
  placeWorld,
  type Rng,
  randomMatrix,
  resizeWorld,
  type SpawnPoint,
  seededRng,
  snakeMatrix,
  step,
  symmetricMatrix,
  type World,
  zeroMatrix,
} from './sim.ts'
export { loadWasmStep, type Stepper } from './wasm.ts'
