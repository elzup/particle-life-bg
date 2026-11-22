// Particle Life: 種類ごとの非対称な引力/斥力行列だけで、細胞・鎖・捕食のような構造が自己組織化する。
// 空間は 幅 width × 高さ 1 のトーラス (端が反対側につながる)。背景として任意の縦横比の要素を
// 埋めるため、高さを 1 に固定して幅を縦横比にする (正方形を引き伸ばすと相互作用が楕円に歪む)。
//
// 毎フレーム数千粒子 × 近傍を回すため、状態は Float32Array を直接書き換える
// (オブジェクト配列を作り直すと GC が 60fps を維持できない)。

export type Matrix = number[][]

export type Params = {
  /** 相互作用が届く距離 (空間の高さ 1 に対する比) */
  rMax: number
  /** 速度が半分になるまでの秒数 */
  frictionHalfLife: number
  /** 力の倍率 */
  forceFactor: number
}

export type World = {
  count: number
  width: number
  types: Uint8Array
  x: Float32Array
  y: Float32Array
  vx: Float32Array
  vy: Float32Array
  /** 直前の step で rMax 内にいた粒子数 (描画で密集度に使う) */
  near: Uint16Array
}

// これより近いと種類に関係なく反発する (粒子が 1 点に潰れないための最小距離、rMax 比)
export const BETA = 0.3

/**
 * 正規化距離 r (0〜1) と引力係数 a (-1〜1) から力の大きさを返す。
 * r < BETA は一律の反発、BETA〜1 は a を頂点とする三角形の山。
 */
export const force = (r: number, a: number): number => {
  if (r < BETA) return r / BETA - 1
  if (r < 1) return a * (1 - Math.abs(2 * r - 1 - BETA) / (1 - BETA))
  return 0
}

/** 周期 period のトーラス上の最短差分 (-period/2〜period/2) */
export const wrapDelta = (d: number, period = 1): number => {
  const halfPeriod = period / 2

  if (d > halfPeriod) return d - period
  if (d < -halfPeriod) return d + period
  return d
}

const wrap = (v: number, period: number): number =>
  v - Math.floor(v / period) * period

export type Rng = () => number

/** 再現できる乱数 (mulberry32)。seed を options で固定したときに同じ模様を出すため */
export const seededRng = (seed: number): Rng => {
  let s = seed >>> 0

  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s

    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32
  }
}

export const randomMatrix = (n: number, rng: Rng = Math.random): Matrix =>
  Array.from({ length: n }, () =>
    Array.from({ length: n }, () => rng() * 2 - 1)
  )

/** a[i][j] = a[j][i]。作用反作用がそろうので、固まりが静かに落ち着きやすい */
export const symmetricMatrix = (n: number, rng: Rng = Math.random): Matrix => {
  const base = randomMatrix(n, rng)

  return base.map((row, i) =>
    row.map((v, j) => (j < i ? (base[j]?.[i] ?? v) : v))
  )
}

/** 自分に強く引かれ、次の種類を少し追う。色の順に連なった鎖ができる */
export const snakeMatrix = (n: number): Matrix =>
  Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      if (j === i) return 1
      if (j === (i + 1) % n) return 0.2
      return 0
    })
  )

export const zeroMatrix = (n: number): Matrix =>
  Array.from({ length: n }, () => Array.from({ length: n }, () => 0))

export const createWorld = (
  count: number,
  typeCount: number,
  width = 1,
  rng: Rng = Math.random
): World => {
  const types = new Uint8Array(count)
  const x = new Float32Array(count)
  const y = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    types[i] = Math.floor(rng() * typeCount)
    x[i] = rng() * width
    y[i] = rng()
  }

  return {
    count,
    width,
    types,
    x,
    y,
    vx: new Float32Array(count),
    vy: new Float32Array(count),
    near: new Uint16Array(count),
  }
}

/** 初期配置の 1 点。x, y は要素の幅・高さに対する 0〜1。type を省くと乱数で撒いた種類のまま */
export type SpawnPoint = { x: number; y: number; type?: number }

/**
 * 撒いた world の先頭から points の位置に置き直す。点が粒子数より少なければ残りは乱数の配置のまま、
 * 多ければ余りを捨てる (粒子数は count が決める)
 */
export const placeWorld = (
  world: World,
  points: readonly SpawnPoint[],
  typeCount: number
): void => {
  const n = Math.min(world.count, points.length)

  for (let i = 0; i < n; i++) {
    const p = points[i]
    if (p === undefined) continue
    world.x[i] = wrap(p.x * world.width, world.width)
    world.y[i] = wrap(p.y, 1)
    if (p.type !== undefined)
      world.types[i] = Math.min(typeCount - 1, Math.max(0, Math.floor(p.type)))
  }
}

/** 縦横比が変わったとき、粒子の横位置を比例で伸縮して模様を保つ (撒き直すと構造が消える) */
export const resizeWorld = (world: World, width: number): void => {
  const k = width / world.width

  for (let i = 0; i < world.count; i++) {
    world.x[i] = wrap((world.x[i] ?? 0) * k, width)
  }
  world.width = width
}

type Grid = {
  sx: number
  sy: number
  cellW: number
  start: Int32Array
  items: Int32Array
}

const cellIndex = (grid: Grid, x: number, y: number): number => {
  const cx = Math.min(grid.sx - 1, Math.floor(x / grid.cellW))
  const cy = Math.min(grid.sy - 1, Math.floor(y * grid.sy))

  return cy * grid.sx + cx
}

// rMax 以上の大きさのセルに粒子を振り分ける (counting sort)。近傍探索を 3×3 セルに限定するため
const buildGrid = (world: World, rMax: number): Grid => {
  const sx = Math.max(1, Math.floor(world.width / rMax))
  const sy = Math.max(1, Math.floor(1 / rMax))
  const cells = sx * sy
  const grid: Grid = {
    sx,
    sy,
    cellW: world.width / sx,
    start: new Int32Array(cells + 1),
    items: new Int32Array(world.count),
  }
  const cellOf = new Int32Array(world.count)

  for (let i = 0; i < world.count; i++) {
    const c = cellIndex(grid, world.x[i] ?? 0, world.y[i] ?? 0)

    cellOf[i] = c
    grid.start[c + 1] = (grid.start[c + 1] ?? 0) + 1
  }
  for (let c = 0; c < cells; c++) {
    grid.start[c + 1] = (grid.start[c + 1] ?? 0) + (grid.start[c] ?? 0)
  }

  const fill = grid.start.slice(0, cells)

  for (let i = 0; i < world.count; i++) {
    const c = cellOf[i] ?? 0
    const at = fill[c] ?? 0

    grid.items[at] = i
    fill[c] = at + 1
  }
  return grid
}

// どちらかの軸のセル数が 3 未満だと 3×3 近傍が同じセルを重複して数えるので、全探索に切り替える
const MIN_GRID_SIZE = 3

// セルごとの近傍セル一覧。粒子ごとに組み立てると毎フレーム数千の配列確保になるので先に作る
const neighborTable = (sx: number, sy: number): number[][] => {
  const cells = sx * sy

  if (sx < MIN_GRID_SIZE || sy < MIN_GRID_SIZE) {
    const all = Array.from({ length: cells }, (_, k) => k)

    return Array.from({ length: cells }, () => all)
  }
  return Array.from({ length: cells }, (_, c) => {
    const cx = c % sx
    const cy = Math.floor(c / sx)

    return [-1, 0, 1].flatMap((dy) =>
      [-1, 0, 1].map((dx) => ((cy + dy + sy) % sy) * sx + ((cx + dx + sx) % sx))
    )
  })
}

const flatten = (matrix: Matrix): Float32Array => {
  const n = matrix.length
  const flat = new Float32Array(n * n)

  matrix.forEach((row, i) => {
    row.forEach((v, j) => {
      flat[i * n + j] = v
    })
  })
  return flat
}

type Ctx = {
  world: World
  grid: Grid
  neighbors: number[][]
  attraction: Float32Array
  typeCount: number
  rMax: number
}

// 粒子 i が受ける力を out[0], out[1]、近傍数を out[2] に書く (タプルを返すと粒子ごとに配列を確保するため)
const accumulate = (ctx: Ctx, i: number, out: Float32Array): void => {
  const { world, grid, attraction, typeCount, rMax } = ctx
  const { x, y, types, width } = world
  const xi = x[i] ?? 0
  const yi = y[i] ?? 0
  const rowOffset = (types[i] ?? 0) * typeCount
  const r2Max = rMax * rMax
  let fx = 0
  let fy = 0
  let near = 0

  for (const c of ctx.neighbors[cellIndex(grid, xi, yi)] ?? []) {
    const end = grid.start[c + 1] ?? 0

    for (let k = grid.start[c] ?? 0; k < end; k++) {
      const j = grid.items[k] ?? 0
      const dx = wrapDelta((x[j] ?? 0) - xi, width)
      const dy = wrapDelta((y[j] ?? 0) - yi)
      const d2 = dx * dx + dy * dy

      // j === i は d2 === 0 で弾かれる
      if (d2 === 0 || d2 >= r2Max) continue
      const dist = Math.sqrt(d2)
      const f = force(dist / rMax, attraction[rowOffset + (types[j] ?? 0)] ?? 0)

      fx += (dx / dist) * f
      fy += (dy / dist) * f
      near++
    }
  }
  out[0] = fx
  out[1] = fy
  out[2] = near
}

/** dt 秒ぶん進める (world を書き換える) */
export const step = (
  world: World,
  matrix: Matrix,
  params: Params,
  dt: number
): void => {
  const { rMax, frictionHalfLife, forceFactor } = params
  const grid = buildGrid(world, rMax)
  const ctx: Ctx = {
    world,
    grid,
    neighbors: neighborTable(grid.sx, grid.sy),
    attraction: flatten(matrix),
    typeCount: matrix.length,
    rMax,
  }
  const damping = 0.5 ** (dt / frictionHalfLife)
  const ax = new Float32Array(world.count)
  const ay = new Float32Array(world.count)
  const out = new Float32Array(3)

  // 全員の力を出してから動かす (順に動かすと先に動いた粒子の位置で後続の力が歪む)
  for (let i = 0; i < world.count; i++) {
    accumulate(ctx, i, out)
    ax[i] = (out[0] ?? 0) * rMax * forceFactor
    ay[i] = (out[1] ?? 0) * rMax * forceFactor
    world.near[i] = out[2] ?? 0
  }
  for (let i = 0; i < world.count; i++) {
    const vx = (world.vx[i] ?? 0) * damping + (ax[i] ?? 0) * dt
    const vy = (world.vy[i] ?? 0) * damping + (ay[i] ?? 0) * dt

    world.vx[i] = vx
    world.vy[i] = vy
    world.x[i] = wrap((world.x[i] ?? 0) + vx * dt, world.width)
    world.y[i] = wrap((world.y[i] ?? 0) + vy * dt, 1)
  }
}
