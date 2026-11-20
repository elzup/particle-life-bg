import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  BASE_DEFAULTS,
  shortestPeriod,
  toOptions,
  toReact,
  toVanilla,
} from '../examples/codegen.js'
import { estimate, FORMATS, rate } from '../examples/perf.js'

const base = {
  ...BASE_DEFAULTS,
  seed: undefined,
  drawStyle: Array(6).fill('dots'),
  background: undefined,
}

describe('toOptions', () => {
  test('既定値だけなら空', () => {
    assert.deepEqual(toOptions(base), {})
  })
  test('colors は指定したときだけ出る', () => {
    assert.deepEqual(toOptions({ ...base, colors: ['#ff0000'] }), {
      colors: ['#ff0000'],
    })
    assert.deepEqual(toOptions({ ...base, colors: [] }), {})
  })
  test('違う値だけ残る', () => {
    assert.deepEqual(
      toOptions({ ...base, count: 800, scheme: 'neon', seed: 3 }),
      {
        count: 800,
        seed: 3,
        scheme: 'neon',
      }
    )
  })
  test('drawStyle は最短周期にまとめる', () => {
    const drawStyle = ['glow', 'dots', 'glow', 'dots', 'glow', 'dots']
    assert.deepEqual(toOptions({ ...base, drawStyle }).drawStyle, [
      'glow',
      'dots',
    ])
    assert.equal(
      toOptions({ ...base, drawStyle: Array(6).fill('glow') }).drawStyle,
      'glow'
    )
  })
  test('custom 行列は丸めて出し、types は省く', () => {
    const o = toOptions({
      ...base,
      types: 2,
      matrix: [
        [0.123, -1],
        [0.5, 0.0049],
      ],
    })
    assert.deepEqual(o, {
      matrix: [
        [0.12, -1],
        [0.5, 0],
      ],
    })
  })
})

test('shortestPeriod', () => {
  assert.deepEqual(shortestPeriod(['a', 'b', 'c']), ['a', 'b', 'c'])
  assert.deepEqual(shortestPeriod(['a', 'a']), ['a'])
})

describe('コード生成', () => {
  test('オプションが無ければ引数なし', () => {
    assert.match(toVanilla({}), /mount\(document\.querySelector\('\.hero'\)\)$/)
    assert.match(toReact({}), /<ParticleLifeBg \/>/)
  })
  test('React は文字列を属性、それ以外を式で渡す', () => {
    const code = toReact({
      scheme: 'fire',
      count: 800,
      drawStyle: ['glow', 'dots'],
    })
    assert.match(code, /scheme="fire"/)
    assert.match(code, /count=\{800\}/)
    assert.match(code, /drawStyle=\{\['glow', 'dots'\]\}/)
  })
})

describe('estimate', () => {
  const desktop = FORMATS.find((f) => f.id === 'desktop')
  const mobile = FORMATS.find((f) => f.id === 'mobile')
  assert.ok(desktop && mobile)

  test('粒子数を増やすと重くなる', () => {
    const light = estimate(base, desktop)
    const heavy = estimate({ ...base, count: 4000 }, desktop)
    assert.ok(heavy.load > light.load)
    assert.ok(heavy.stars <= light.stars)
  })
  test('fps を半分にすると占有率も半分', () => {
    const a = estimate(base, desktop)
    const b = estimate({ ...base, fps: base.fps / 2 }, desktop)
    assert.ok(Math.abs(b.load - a.load / 2) < 1e-9)
  })
  test('縦長は近傍セルが少ないぶん同じ粒子数でも重い', () => {
    const wide = estimate(base, { ...mobile, width: 844, height: 390 })
    const tall = estimate(base, mobile)
    assert.ok(tall.frameMs > wide.frameMs)
  })
  test('rate は 5 段階', () => {
    assert.equal(rate(0).stars, 5)
    assert.equal(rate(10).stars, 1)
  })
})

test('toHtml は版を固定し、値なし属性と値あり属性を書き分ける', async () => {
  const { toHtml } = await import('../examples/codegen.js')
  const { toAttributes } = await import('../src/attributes.ts')
  const html = toHtml({ scheme: 'neon', paused: true }, toAttributes, '1.2.3')
  assert.match(html, /particle-life-bg@1\.2\.3\/lib\/esm\/element\.js/)
  assert.match(html, /\n {2}scheme="neon"\n {2}paused\n>/)
})
