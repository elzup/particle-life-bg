// 計算部分だけのベンチを Node (V8) で回す。ブラウザと同じエンジンなので桁の目安になる。
// 先に pnpm build:wasm で lib/wasm/*.wasm を作っておく
import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'

import { maxDrift, runBench } from '../examples/bench-core.js'
import { loadWasmSim } from '../examples/wasm-sim.js'
import * as lib from '../src/index.ts'

const load = async (name: string, file: string) => ({
  name,
  sim: await loadWasmSim(
    await readFile(new URL(`../lib/wasm/${file}`, import.meta.url))
  ),
})

const wasms = [
  await load('WASM', 'sim.wasm'),
  await load('WASM SIMD', 'sim-simd.wasm'),
]

for (const w of wasms) {
  console.log(
    `${w.name}: JS との最大のずれ (5 step 後) = ${maxDrift(lib, w.sim).toExponential(2)}`
  )
}
console.log(`node ${process.version}`)
for (const row of runBench(lib, wasms, () => performance.now())) {
  const cells = row.results.map(
    (r) => `${r.name} ${r.ms.toFixed(2)}ms (×${r.speedup.toFixed(2)})`
  )
  console.log(`${String(row.count).padStart(5)} 粒子: ${cells.join(' | ')}`)
}
