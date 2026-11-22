import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { describe, test } from 'node:test'

import { maxDrift } from '../examples/bench-core.js'
import { loadWasmSim } from '../examples/wasm-sim.js'
import * as lib from '../src/sim-api.ts'

const builds = [
  { file: 'sim.wasm', isSimd: false },
  { file: 'sim-simd.wasm', isSimd: true },
]
// float の演算順の違い (SIMD は 4 粒子ずつ足す) だけが残る大きさ。式を取り違えると 1e-3 以上ずれる
const MAX_DRIFT = 1e-5

// Rust のビルド環境が無い CI でも通るよう、pnpm build:wasm していなければ飛ばす
describe('wasm sim は JS 版と同じ結果', () => {
  for (const b of builds) {
    const url = new URL(`../lib/wasm/${b.file}`, import.meta.url)
    test(b.file, {
      skip: !existsSync(url) && 'pnpm build:wasm が未実行',
    }, async () => {
      const sim = await loadWasmSim(await readFile(url))
      assert.equal(sim.isSimd, b.isSimd)
      assert.ok(maxDrift(lib, sim) < MAX_DRIFT)
    })
  }
})
