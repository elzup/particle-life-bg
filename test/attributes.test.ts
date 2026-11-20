import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  ATTRIBUTES,
  parseAttribute,
  readAttributes,
  toAttributes,
} from '../src/attributes.ts'

const fromRecord = (r: Record<string, string>) => (a: string) => r[a] ?? null

describe('parseAttribute', () => {
  test('boolean は属性があれば true、"false" だけ false', () => {
    assert.equal(parseAttribute('boolean', ''), true)
    assert.equal(parseAttribute('boolean', 'false'), false)
    assert.equal(parseAttribute('boolean', null), undefined)
  })
  test('数として読めない値は既定値に任せる', () => {
    assert.equal(parseAttribute('number', '30'), 30)
    assert.equal(parseAttribute('number', 'abc'), undefined)
    assert.equal(parseAttribute('number', ''), undefined)
  })
  test('draw-style は空白・カンマ区切りで、知らない名前は捨てる', () => {
    assert.deepEqual(parseAttribute('styles', 'glow, dots nope'), [
      'glow',
      'dots',
    ])
    assert.equal(parseAttribute('styles', 'nope'), undefined)
  })
  test('matrix はプリセット名か正方行列の JSON', () => {
    assert.equal(parseAttribute('matrix', 'snake'), 'snake')
    assert.deepEqual(parseAttribute('matrix', '[[1,0],[0,-1]]'), [
      [1, 0],
      [0, -1],
    ])
    const warn = console.warn
    console.warn = () => {}
    assert.equal(parseAttribute('matrix', '[[1,0]]'), undefined)
    assert.equal(parseAttribute('matrix', '{oops'), undefined)
    console.warn = warn
  })
})

test('readAttributes は書かれた属性だけを options にする', () => {
  assert.deepEqual(
    readAttributes(
      fromRecord({ 'r-max': '0.2', 'draw-style': 'glow', paused: '' })
    ),
    { rMax: 0.2, drawStyle: ['glow'], paused: true }
  )
})

test('toAttributes → readAttributes で往復できる', () => {
  const options = {
    count: 800,
    matrix: [
      [0.5, -1],
      [0, 1],
    ],
    drawStyle: ['glow' as const, 'dots' as const],
    scheme: 'neon' as const,
    pauseWhenHidden: false,
    paused: true,
  }
  const attrs = Object.fromEntries(
    toAttributes(options).map(([k, v]) => [k, v ?? ''])
  )
  assert.deepEqual(readAttributes(fromRecord(attrs)), options)
})

test('属性名は kebab-case で重複しない', () => {
  const names = ATTRIBUTES.map((s) => s.attr)
  assert.equal(new Set(names).size, names.length)
  for (const n of names) assert.match(n, /^[a-z]+(-[a-z]+)*$/)
})
