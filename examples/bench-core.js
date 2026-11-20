// 計算部分だけの比較 (JS / WASM / WASM SIMD)。描画は含めない。ブラウザ (bench.html) と Node (scripts/bench.ts) で共用する

// 同じ条件で比べるため、行列と初期配置は固定の種から作る
const SEED = 42
const TYPES = 5
const PARAMS = { rMax: 0.1, frictionHalfLife: 0.04, forceFactor: 10 }
const DT = 0.02
// 16:9 の画面を想定した空間の幅 (高さ 1 に対する比)
const WIDTH = 16 / 9
// JIT が温まり、粒子が塊を作って近傍数が落ち着くまで回してから測る (ばらけた初期配置は実運用より軽い)
const WARMUP_STEPS = 60
const MEASURE_STEPS = 120
export const COUNTS = [1500, 3000, 5000]

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

const timeSteps = (stepOnce, now) => {
  for (let k = 0; k < WARMUP_STEPS; k++) stepOnce()
  const samples = []
  for (let k = 0; k < MEASURE_STEPS; k++) {
    const t0 = now()
    stepOnce()
    samples.push(now() - t0)
  }
  return median(samples)
}

/**
 * @param {typeof import('../src/index.ts')} lib
 * @param {{ name: string, sim: Awaited<ReturnType<typeof import('./wasm-sim.js').loadWasmSim>> }[]} wasms
 * @param {() => number} now
 */
export const runBench = (lib, wasms, now) =>
  COUNTS.map((count) => {
    const fresh = () => {
      const rng = lib.seededRng(SEED)
      const matrix = lib.randomMatrix(TYPES, rng)
      const world = lib.createWorld(
        count,
        TYPES,
        WIDTH,
        lib.seededRng(SEED + 1)
      )
      return { matrix, world }
    }
    const js = fresh()
    const results = [
      {
        name: 'JS',
        ms: timeSteps(() => lib.step(js.world, js.matrix, PARAMS, DT), now),
      },
    ]
    for (const w of wasms) {
      const { matrix, world } = fresh()
      w.sim.load(world, matrix)
      results.push({
        name: w.name,
        ms: timeSteps(() => w.sim.step(PARAMS, DT), now),
      })
    }
    const base = results[0].ms
    return {
      count,
      results: results.map((r) => ({ ...r, speedup: base / r.ms })),
    }
  })

/** 同じ初期状態から n ステップ進め、JS 版との位置のずれの最大値を返す (式の移植ミスの検出用) */
export const maxDrift = (lib, sim, { count = 800, steps = 5 } = {}) => {
  const make = () => ({
    matrix: lib.randomMatrix(TYPES, lib.seededRng(SEED)),
    world: lib.createWorld(count, TYPES, WIDTH, lib.seededRng(SEED + 1)),
  })
  const a = make()
  const b = make()
  const view = sim.load(b.world, b.matrix)
  for (let k = 0; k < steps; k++) {
    lib.step(a.world, a.matrix, PARAMS, DT)
    sim.step(PARAMS, DT)
  }
  let drift = 0
  for (let i = 0; i < count; i++) {
    drift = Math.max(
      drift,
      Math.abs(a.world.x[i] - view.x[i]),
      Math.abs(a.world.y[i] - view.y[i])
    )
  }
  return drift
}
