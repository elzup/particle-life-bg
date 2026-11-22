// パッケージに同梱する WASM SIMD (src/wasm-simd.gen.ts) が JS 版の step と同じ結果を出すか。
// 生成物はコミット済みなので Rust の無い CI でも走る
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  createWorld,
  randomMatrix,
  resizeWorld,
  seededRng,
  step,
} from '../src/sim.ts'
import { loadWasmStep } from '../src/wasm.ts'

const params = { rMax: 0.1, frictionHalfLife: 0.04, forceFactor: 10 }
const DT = 0.02
const TYPES = 5
// float の演算順の違い (SIMD は 4 粒子ずつ足す) だけが残る大きさ。式を取り違えると 1e-3 以上ずれる
const MAX_DRIFT = 1e-5

const pair = (count: number, width: number) => {
  const make = () => ({
    matrix: randomMatrix(TYPES, seededRng(42)),
    world: createWorld(count, TYPES, width, seededRng(43)),
  })
  return [make(), make()] as const
}

const drift = (a: Float32Array, b: Float32Array) =>
  a.reduce((m, v, i) => Math.max(m, Math.abs(v - (b[i] ?? 0))), 0)

describe('loadWasmStep', () => {
  test('JS 版の step と同じ位置・速度・近傍数になる', async () => {
    const wasmStep = await loadWasmStep()
    assert.ok(wasmStep !== null, 'Node は SIMD 対応なので null にならない')
    const [js, wasm] = pair(800, 16 / 9)

    for (let k = 0; k < 5; k++) {
      step(js.world, js.matrix, params, DT)
      wasmStep(wasm.world, wasm.matrix, params, DT)
    }
    assert.ok(drift(js.world.x, wasm.world.x) < MAX_DRIFT)
    assert.ok(drift(js.world.y, wasm.world.y) < MAX_DRIFT)
    assert.ok(drift(js.world.vx, wasm.world.vx) < MAX_DRIFT * 100)
    assert.deepEqual(wasm.world.near, js.world.near)
  })

  test('粒子数・幅・行列が途中で変わっても追従する', async () => {
    const wasmStep = await loadWasmStep()
    assert.ok(wasmStep !== null)
    const [js, wasm] = pair(300, 1)

    wasmStep(wasm.world, wasm.matrix, params, DT)
    step(js.world, js.matrix, params, DT)
    resizeWorld(js.world, 2)
    resizeWorld(wasm.world, 2)
    const matrix = randomMatrix(TYPES, seededRng(7))
    step(js.world, matrix, params, DT)
    wasmStep(wasm.world, matrix, params, DT)
    assert.ok(drift(js.world.x, wasm.world.x) < MAX_DRIFT)

    const [bigJs, bigWasm] = pair(2000, 16 / 9)
    step(bigJs.world, bigJs.matrix, params, DT)
    wasmStep(bigWasm.world, bigWasm.matrix, params, DT)
    assert.ok(drift(bigJs.world.x, bigWasm.world.x) < MAX_DRIFT)
  })

  test('粒子 0 個でも落ちない', async () => {
    const wasmStep = await loadWasmStep()
    assert.ok(wasmStep !== null)
    wasmStep(createWorld(0, TYPES), randomMatrix(TYPES), params, DT)
  })
})
