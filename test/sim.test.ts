import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  BETA,
  createWorld,
  force,
  resizeWorld,
  seededRng,
  snakeMatrix,
  step,
  symmetricMatrix,
  wrapDelta,
  zeroMatrix,
} from '../src/sim.ts'

const params = { rMax: 0.1, frictionHalfLife: 0.04, forceFactor: 10 }
const close = (a: number, b: number, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`)

describe('force', () => {
  test('近距離は係数に関係なく反発 (負)', () => {
    assert.equal(force(0, 1), -1)
    assert.ok(force(BETA / 2, 1) < 0)
    assert.equal(force(BETA / 2, -1), force(BETA / 2, 1))
  })
  test('中間距離で係数 a が最大になる', () => {
    const mid = (1 + BETA) / 2

    close(force(mid, 0.7), 0.7)
    close(force(mid, -0.4), -0.4)
  })
  test('rMax 以遠は 0', () => {
    assert.equal(force(1, 1), 0)
    assert.equal(force(1.5, -1), 0)
  })
  test('BETA と 1 で連続', () => {
    close(force(BETA, 1), 0)
    close(force(0.999999, 1), 0, 1e-4)
  })
})

describe('wrapDelta', () => {
  test('トーラス上の最短差分を返す', () => {
    close(wrapDelta(0.9), -0.1)
    close(wrapDelta(-0.9), 0.1)
    close(wrapDelta(0.3), 0.3)
  })
  test('周期を指定できる', () => {
    close(wrapDelta(1.5, 2), -0.5)
    close(wrapDelta(0.9, 2), 0.9)
  })
})

describe('matrix presets', () => {
  test('symmetricMatrix は転置と一致', () => {
    const m = symmetricMatrix(5, seededRng(1))

    m.forEach((row, i) => {
      row.forEach((v, j) => {
        assert.equal(v, m[j]?.[i])
      })
    })
  })
  test('snakeMatrix は自分 1・次 0.2', () => {
    const m = snakeMatrix(3)

    assert.deepEqual(m[0], [1, 0.2, 0])
    assert.deepEqual(m[2], [0.2, 0, 1])
  })
  test('seededRng は同じ種で同じ列', () => {
    const a = seededRng(42)
    const b = seededRng(42)

    assert.deepEqual([a(), a(), a()], [b(), b(), b()])
  })
})

const assertInside = (world: ReturnType<typeof createWorld>) => {
  for (let i = 0; i < world.count; i++) {
    const x = world.x[i] ?? -1
    const y = world.y[i] ?? -1

    assert.ok(x >= 0 && x <= world.width, `x=${x}`)
    assert.ok(y >= 0 && y <= 1, `y=${y}`)
  }
}

describe('step', () => {
  test('位置は常に空間内に収まる (横長でも)', () => {
    const world = createWorld(300, 4, 1.8, seededRng(2))
    const m = symmetricMatrix(4, seededRng(3))

    for (let k = 0; k < 30; k++) step(world, m, params, 0.02)
    assertInside(world)
  })
  test('近すぎる 2 粒子は係数 0 でも離れる', () => {
    const world = createWorld(2, 1, 1, seededRng(4))

    world.x.set([0.5, 0.505])
    world.y.set([0.5, 0.5])
    step(world, zeroMatrix(1), params, 0.02)
    assert.ok((world.x[1] ?? 0) - (world.x[0] ?? 0) > 0.005)
  })
  test('near は rMax 内の他粒子数', () => {
    const world = createWorld(3, 1, 1, seededRng(6))

    world.x.set([0.5, 0.55, 0.9])
    world.y.set([0.5, 0.5, 0.5])
    step(world, zeroMatrix(1), params, 0.02)
    assert.deepEqual(Array.from(world.near), [1, 1, 0])
  })
  test('横長の右端と左端もつながる', () => {
    const world = createWorld(2, 1, 2, seededRng(5))

    world.x.set([0.002, 1.998])
    world.y.set([0.5, 0.5])
    step(world, zeroMatrix(1), params, 0.02)
    // 0 側は +x へ、右端側は -x へ押し出される
    assert.ok((world.vx[0] ?? 0) > 0)
    assert.ok((world.vx[1] ?? 0) < 0)
  })
  test('上下の境界をまたいだ近傍にも力が届く', () => {
    const world = createWorld(2, 1, 1.5, seededRng(7))

    world.x.set([0.7, 0.7])
    world.y.set([0.002, 0.998])
    step(world, zeroMatrix(1), params, 0.02)
    assert.ok((world.vy[0] ?? 0) > 0)
    assert.ok((world.vy[1] ?? 0) < 0)
  })
})

describe('resizeWorld', () => {
  test('横位置を比例で伸縮する', () => {
    const world = createWorld(2, 1, 1, seededRng(8))

    world.x.set([0.25, 0.75])
    resizeWorld(world, 2)
    assert.equal(world.width, 2)
    close(world.x[0] ?? 0, 0.5)
    close(world.x[1] ?? 0, 1.5)
  })
})
