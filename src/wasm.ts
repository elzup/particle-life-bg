// step の WASM SIMD 版 (wasm/src/simd.rs)。式は sim.ts の step と同じで、計算だけ 3.5〜4.8 倍速い (pnpm bench)。
// .wasm は base64 で別モジュール (wasm-simd.gen.ts) に置き、dynamic import で読む。
// bundler 側に .wasm の設定が要らず、初回描画に要る JS も太らない (読み込みが済むまでは JS 版で進める)
import type { Matrix, Params, World } from './sim.ts'

export type Stepper = (
  world: World,
  matrix: Matrix,
  params: Params,
  dt: number
) => void

type Exports = {
  memory: WebAssembly.Memory
  init: (count: number, typeCount: number, width: number) => void
  ptr_types: () => number
  ptr_x: () => number
  ptr_y: () => number
  ptr_vx: () => number
  ptr_vy: () => number
  ptr_near: () => number
  ptr_matrix: () => number
  step: (
    rMax: number,
    frictionHalfLife: number,
    force: number,
    dt: number
  ) => void
}

type Views = {
  types: Uint8Array
  x: Float32Array
  y: Float32Array
  vx: Float32Array
  vy: Float32Array
  near: Uint16Array
  matrix: Float32Array
}

const decodeBase64 = (b64: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array(Array.from(atob(b64), (c) => c.charCodeAt(0)))

let compiled: Promise<WebAssembly.Module | null> | undefined

// compile は 1 ページで 1 回だけにし、mount ごとに instance を分ける (WASM 側の状態はモジュールに 1 つなので共有できない)
const compileOnce = (): Promise<WebAssembly.Module | null> => {
  compiled ??=
    typeof WebAssembly === 'undefined'
      ? Promise.resolve(null)
      : import('./wasm-simd.gen.ts')
          .then((m) => WebAssembly.compile(decodeBase64(m.SIM_SIMD_WASM)))
          .catch((e: unknown) => {
            // SIMD 非対応のブラウザ (compile が CompileError) や CSP の wasm-unsafe-eval 不許可で起きる。
            // JS 版で同じ結果を出せるので背景は止めず、原因だけ残す
            console.info(
              'particle-life-bg: WASM SIMD を使わず JS で計算する',
              e
            )
            return null
          })
  return compiled
}

const viewsOf = (ex: Exports, count: number, typeCount: number): Views => {
  const buf = ex.memory.buffer

  return {
    types: new Uint8Array(buf, ex.ptr_types(), count),
    x: new Float32Array(buf, ex.ptr_x(), count),
    y: new Float32Array(buf, ex.ptr_y(), count),
    vx: new Float32Array(buf, ex.ptr_vx(), count),
    vy: new Float32Array(buf, ex.ptr_vy(), count),
    near: new Uint16Array(buf, ex.ptr_near(), count),
    matrix: new Float32Array(buf, ex.ptr_matrix(), typeCount * typeCount),
  }
}

const writeMatrix = (dst: Float32Array, matrix: Matrix): void => {
  const n = matrix.length

  matrix.forEach((row, i) => {
    row.forEach((v, j) => {
      dst[i * n + j] = v
    })
  })
}

// World は JS 側の配列のまま持ち、step のたびに WASM のメモリへ写して戻す。
// 写す量は粒子数 × 数配列で計算の 1% 未満。World を WASM のメモリ上に置くと、メモリが伸びるたびに
// 描画や resizeWorld が持つ配列が無効になるので避ける
const createStepper = (ex: Exports): Stepper => {
  let shape = { count: -1, typeCount: -1, width: Number.NaN }
  let views: Views | null = null

  const currentViews = () => {
    // step 中の確保でメモリが伸びると古い view は長さ 0 になる (detach) ので作り直す
    if (views === null || views.x.buffer !== ex.memory.buffer)
      views = viewsOf(ex, shape.count, shape.typeCount)
    return views
  }

  return (world, matrix, params, dt) => {
    if (world.count === 0) return
    const typeCount = matrix.length

    if (
      shape.count !== world.count ||
      shape.typeCount !== typeCount ||
      shape.width !== world.width
    ) {
      ex.init(world.count, typeCount, world.width)
      shape = { count: world.count, typeCount, width: world.width }
      views = null
    }
    const input = currentViews()

    input.types.set(world.types)
    input.x.set(world.x)
    input.y.set(world.y)
    input.vx.set(world.vx)
    input.vy.set(world.vy)
    writeMatrix(input.matrix, matrix)
    ex.step(params.rMax, params.frictionHalfLife, params.forceFactor, dt)

    const output = currentViews()

    world.x.set(output.x)
    world.y.set(output.y)
    world.vx.set(output.vx)
    world.vy.set(output.vy)
    world.near.set(output.near)
  }
}

/**
 * WASM SIMD 版の step を用意する。使えない環境 (SIMD 非対応・CSP で WASM 禁止) では null。
 * 返る関数は sim.ts の step と同じ引数で、呼ぶたびに world を書き換える。mount ごとに別の関数を使う
 */
export const loadWasmStep = async (): Promise<Stepper | null> => {
  const module = await compileOnce()
  if (module === null) return null
  const instance = await WebAssembly.instantiate(module, {})

  return createStepper(instance.exports as unknown as Exports)
}
