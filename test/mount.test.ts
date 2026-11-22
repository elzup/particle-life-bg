// mount の DOM まわり: 後片付け、rAF の回し方、holdMs の数え始め、見えない間の停止、engine の切り替え
import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'

import {
  countDraws,
  type FakeCanvasInstance,
  type FakeDom,
  installFakeDom,
  takeFrame,
} from './fake-dom.ts'

const dom: FakeDom = installFakeDom()
const { mount } = await import('../src/mount.ts')

// fps 30 の 1 フレームより十分長い間隔。loop は 1000/fps - 1 ms 未満の rAF を読み飛ばす
const TICK = 40
// lastStepAt の初期値が 0 なので、最初のフレームが確実に進む時刻から始める
const T0 = 1000

const div = () => new dom.FakeElement() as unknown as HTMLElement
const canvasOf = (bg: { canvas: HTMLCanvasElement }) =>
  bg.canvas as unknown as FakeCanvasInstance

const waitFor = async (cond: () => boolean, ms = 3000) => {
  const until = Date.now() + ms

  while (!cond()) {
    if (Date.now() > until) throw new Error('timeout')
    await new Promise((r) => setTimeout(r, 10))
  }
}

beforeEach(() => {
  dom.setHidden(false)
  dom.setReducedMotion(false)
})

describe('mount: DOM', () => {
  test('div には canvas を敷き、destroy で外して購読を全部解く', () => {
    const target = div()
    const bg = mount(target, { engine: 'js' })
    const el = target as unknown as InstanceType<FakeDom['FakeElement']>

    assert.equal(el.children[0], bg.canvas)
    assert.equal(canvasOf(bg).attributes.get('aria-hidden'), 'true')
    assert.equal(dom.pendingFrames(), 1)
    bg.destroy()
    assert.equal(el.children.length, 0)
    assert.equal(dom.pendingFrames(), 0)
    assert.equal(dom.activeObservers(), 0)
    assert.equal(dom.docListenerCount(), 0)
    assert.equal(dom.motionListenerCount(), 0)
  })

  test('渡された canvas は destroy でも外さない', () => {
    const parent = new dom.FakeElement()
    const canvas = new dom.FakeCanvas()

    parent.prepend(canvas)
    mount(canvas as unknown as HTMLElement, { engine: 'js' }).destroy()
    assert.equal(parent.children[0], canvas)
  })

  test('spawn には count / types / 縦横比が渡る', () => {
    let got: unknown

    mount(div(), {
      engine: 'js',
      count: 10,
      types: 3,
      spawn: (ctx) => {
        got = ctx
        return []
      },
    }).destroy()
    assert.deepEqual(got, { count: 10, types: 3, aspect: 320 / 180 })
  })
})

describe('mount: loop', () => {
  test('フレームごとに進み、fps より速い rAF は読み飛ばす', () => {
    const bg = mount(div(), { engine: 'js', seed: 1 })
    const canvas = canvasOf(bg)

    takeFrame(canvas)
    dom.frame(T0)
    const a = takeFrame(canvas)

    dom.frame(T0 + 5)
    assert.equal(takeFrame(canvas), '[]', '間引いたフレームでは描かない')
    assert.equal(dom.pendingFrames(), 1, '間引いても rAF は続ける')
    dom.frame(T0 + TICK)
    assert.notEqual(takeFrame(canvas), a)
    bg.destroy()
  })

  test('holdMs は mount ではなく最初に見えた時から数え、respawn で数え直す', () => {
    const bg = mount(div(), { engine: 'js', seed: 1, holdMs: 100 })
    const canvas = canvasOf(bg)

    dom.intersect(false)
    assert.equal(dom.pendingFrames(), 0, '画面外では回さない')
    dom.intersect(true)
    takeFrame(canvas)

    const t = 50_000
    dom.frame(t)
    const held = takeFrame(canvas)

    dom.frame(t + TICK)
    assert.equal(takeFrame(canvas), held, 'hold 中は形を保つ')
    dom.frame(t + 3 * TICK)
    assert.notEqual(takeFrame(canvas), held, 'hold が明けたら動く')

    bg.respawn()
    takeFrame(canvas)
    dom.frame(t + 4 * TICK)
    const reheld = takeFrame(canvas)

    dom.frame(t + 5 * TICK)
    assert.equal(takeFrame(canvas), reheld)
    bg.destroy()
  })

  test('タブが隠れたら止まり、戻ったら再開する', () => {
    const bg = mount(div(), { engine: 'js' })

    dom.setHidden(true)
    assert.equal(dom.pendingFrames(), 0)
    dom.setHidden(false)
    assert.equal(dom.pendingFrames(), 1)
    bg.destroy()
  })

  test('pauseWhenHidden: false なら画面外でも回す', () => {
    const bg = mount(div(), { engine: 'js', pauseWhenHidden: false })

    dom.intersect(false)
    assert.equal(dom.pendingFrames(), 1)
    bg.destroy()
  })

  test('pause / resume', () => {
    const bg = mount(div(), { engine: 'js' })

    bg.pause()
    assert.equal(dom.pendingFrames(), 0)
    bg.resume()
    assert.equal(dom.pendingFrames(), 1)
    bg.destroy()
  })

  test('reduced motion では回さず 1 枚描き、解除されたら回す', () => {
    dom.setReducedMotion(true)
    const bg = mount(div(), { engine: 'js' })

    assert.equal(dom.pendingFrames(), 0)
    assert.ok(countDraws(canvasOf(bg)) >= 1)
    dom.setReducedMotion(false)
    assert.equal(dom.pendingFrames(), 1)
    bg.destroy()
  })

  test('止まっている間の resize は描き直す', () => {
    const bg = mount(div(), { engine: 'js', paused: true })
    const canvas = canvasOf(bg)

    canvas.log.splice(0)
    canvas.rect = { width: 640, height: 360 }
    dom.resize()
    assert.equal(countDraws(canvas), 1)
    bg.destroy()
  })
})

describe('mount: engine', () => {
  test("engine: 'js' は WASM に切り替わらない", async () => {
    const js = mount(div(), { engine: 'js' })
    const auto = mount(div())

    await waitFor(() => auto.engine === 'wasm')
    assert.equal(js.engine, 'js')
    js.destroy()
    auto.destroy()
  })

  test("auto → 'js' に変えたら、後から届いた読み込みは無視する", async () => {
    const switched = mount(div())
    const destroyed = mount(div())

    switched.setOptions({ engine: 'js' })
    destroyed.destroy()
    // 同じ読み込みを待つ別の mount が wasm になれば、上の 2 つにも結果は届いている
    const probe = mount(div())

    await waitFor(() => probe.engine === 'wasm')
    assert.equal(switched.engine, 'js')
    assert.equal(destroyed.engine, 'js')

    switched.setOptions({ engine: 'auto' })
    await waitFor(() => switched.engine === 'wasm')
    switched.destroy()
    probe.destroy()
  })
})
