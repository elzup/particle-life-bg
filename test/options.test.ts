import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { DEFAULTS, diffOptions, resolveOptions } from '../src/options.ts'
import { COLOR_SCHEMES } from '../src/palette.ts'

describe('resolveOptions', () => {
  test('既定値', () => {
    const r = resolveOptions({})

    assert.equal(r.types, DEFAULTS.types)
    assert.equal(r.count, DEFAULTS.count)
    assert.equal(r.matrix.length, DEFAULTS.types)
    assert.equal(r.scheme, COLOR_SCHEMES.rainbow)
    assert.equal(r.background, COLOR_SCHEMES.rainbow.bg)
    assert.deepEqual(r.styles, Array(DEFAULTS.types).fill('dots'))
  })
  test('行列を配列で渡すと種類数はその大きさ', () => {
    const r = resolveOptions({
      types: 9,
      matrix: [
        [1, 0],
        [0, 1],
      ],
    })

    assert.equal(r.types, 2)
  })
  test('seed が同じなら同じ行列', () => {
    assert.deepEqual(
      resolveOptions({ seed: 3 }).matrix,
      resolveOptions({ seed: 3 }).matrix
    )
  })
  test('style 配列は種類数まで繰り返す', () => {
    const r = resolveOptions({ types: 5, drawStyle: ['glow', 'trail'] })

    assert.deepEqual(r.styles, ['glow', 'trail', 'glow', 'trail', 'glow'])
  })
  test("background: 'transparent' は null", () => {
    assert.equal(resolveOptions({ background: 'transparent' }).background, null)
  })
  test('scheme は名前で選べる', () => {
    assert.equal(
      resolveOptions({ scheme: 'paper' }).scheme,
      COLOR_SCHEMES.paper
    )
  })
})

describe('diffOptions', () => {
  test('見た目だけの変更は作り直さない', () => {
    assert.deepEqual(
      diffOptions(
        { count: 10, drawStyle: 'dots' },
        { count: 10, drawStyle: 'glow' }
      ),
      { respawn: false, rematrix: false }
    )
  })
  test('中身が同じ別の行列配列は変更とみなさない', () => {
    const d = diffOptions({ matrix: [[1, 0.5]] }, { matrix: [[1, 0.5]] })

    assert.equal(d.rematrix, false)
  })
  test('粒子数の変更は撒き直し、種類数の変更は行列も作り直す', () => {
    assert.deepEqual(diffOptions({ count: 10 }, { count: 20 }), {
      respawn: true,
      rematrix: false,
    })
    assert.deepEqual(diffOptions({ types: 3 }, { types: 4 }), {
      respawn: true,
      rematrix: true,
    })
  })
})
