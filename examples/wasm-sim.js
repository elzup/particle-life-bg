// WASM 版の計算部分 (wasm/src/lib.rs) を、JS 版の World と同じ形で扱うための薄い包み。ベンチと検証テストで共用する
// ブラウザでも Node でも動くよう、.wasm のバイト列は呼び出し側が用意して渡す

/**
 * @param {BufferSource} bytes
 */
export const loadWasmSim = async (bytes) => {
  const { instance } = await WebAssembly.instantiate(bytes, {})
  const ex = instance.exports
  const memory = ex.memory

  /** WASM のメモリ上の配列を型付き配列として見る。init でメモリが伸びると古い view は無効になるので毎回作る */
  const views = (count, types) => ({
    types: new Uint8Array(memory.buffer, ex.ptr_types(), count),
    x: new Float32Array(memory.buffer, ex.ptr_x(), count),
    y: new Float32Array(memory.buffer, ex.ptr_y(), count),
    vx: new Float32Array(memory.buffer, ex.ptr_vx(), count),
    vy: new Float32Array(memory.buffer, ex.ptr_vy(), count),
    near: new Uint16Array(memory.buffer, ex.ptr_near(), count),
    matrix: new Float32Array(memory.buffer, ex.ptr_matrix(), types * types),
  })

  return {
    isSimd: ex.is_simd() === 1,
    /** JS 版の World と行列を WASM 側に写す。以降は step と view で読み書きする */
    load: (world, matrix) => {
      const n = matrix.length
      ex.init(world.count, n, world.width)
      const v = views(world.count, n)
      v.types.set(world.types)
      v.x.set(world.x)
      v.y.set(world.y)
      v.vx.set(world.vx)
      v.vy.set(world.vy)
      v.matrix.set(matrix.flat())
      return { ...v, count: world.count, width: world.width }
    },
    step: (params, dt) =>
      ex.step(params.rMax, params.frictionHalfLife, params.forceFactor, dt),
  }
}
