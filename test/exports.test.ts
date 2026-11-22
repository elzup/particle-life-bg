// 入口ごとに出している名前の一覧。semver で守る範囲なので、増減は意図して行う (ここを直すこと = API の変更)
import assert from 'node:assert/strict'
import { test } from 'node:test'

import * as main from '../src/index.ts'
import * as sim from '../src/sim-api.ts'

test('particle-life-bg は背景として使う分だけを出す', () => {
  assert.deepEqual(Object.keys(main).sort(), [
    'COLOR_SCHEMES',
    'DEFAULTS',
    'DRAW_STYLES',
    'mount',
    'randomMatrix',
    'seededRng',
    'snakeMatrix',
    'symmetricMatrix',
    'zeroMatrix',
  ])
})

test('particle-life-bg/sim は計算部分を出す', () => {
  assert.deepEqual(Object.keys(sim).sort(), [
    'BETA',
    'createWorld',
    'force',
    'loadWasmStep',
    'placeWorld',
    'randomMatrix',
    'resizeWorld',
    'seededRng',
    'snakeMatrix',
    'step',
    'symmetricMatrix',
    'zeroMatrix',
  ])
})
