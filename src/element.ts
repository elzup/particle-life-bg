// <particle-life-bg> custom element。import するだけで登録される (CDN から <script type="module"> 1 行で使える)
import { ATTRIBUTES, readAttributes } from './attributes.ts'
import { type Controller, mount } from './mount.ts'
import type { Options } from './options.ts'
import type { Matrix } from './sim.ts'

export const TAG_NAME = 'particle-life-bg'

// canvas は背面に敷き、子要素は slot で前面に出す。
// 中身の div を position: relative にするのは、絶対配置の canvas より後に描かれて上に来るようにするため
const TEMPLATE = `
<style>
  :host { display: block; position: relative; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; pointer-events: none; }
  .content { position: relative; height: 100%; }
</style>
<canvas part="canvas" aria-hidden="true"></canvas>
<div class="content" part="content"><slot></slot></div>
`

// Node (SSR) には HTMLElement が無い。import しただけで落ちないよう、空のクラスで型だけ合わせる
const Base: typeof HTMLElement =
  typeof HTMLElement === 'undefined'
    ? (class {} as unknown as typeof HTMLElement)
    : HTMLElement

export class ParticleLifeBgElement extends Base {
  static observedAttributes = ATTRIBUTES.map((s) => s.attr)

  #controller: Controller | null = null
  // 属性で書けない値 (行列の配列・ColorScheme オブジェクト) は property で受け、属性より優先する
  #props: Options = {}

  constructor() {
    super()
    this.attachShadow({ mode: 'open' }).innerHTML = TEMPLATE
  }

  #options(): Options {
    return { ...readAttributes((a) => this.getAttribute(a)), ...this.#props }
  }

  // 登録 (import) 前に el.options / el.matrix へ代入された値は、class の setter を通らず要素自身の
  // property として残る。spawn のように最初の撒きで要る値を先に渡せるよう、拾い直して setter に流す
  #upgradeProps() {
    for (const key of ['options', 'matrix'] as const) {
      if (!Object.hasOwn(this, key)) continue
      const value: unknown = Reflect.get(this, key)
      Reflect.deleteProperty(this, key)
      Reflect.set(this, key, value)
    }
  }

  #apply() {
    this.#controller?.setOptions(this.#options(), 'replace')
  }

  connectedCallback() {
    const canvas = this.shadowRoot?.querySelector('canvas')
    if (!canvas || this.#controller) return
    this.#upgradeProps()
    this.#controller = mount(canvas, this.#options())
  }

  disconnectedCallback() {
    this.#controller?.destroy()
    this.#controller = null
  }

  attributeChangedCallback() {
    this.#apply()
  }

  /** 属性より優先する追加の options (property 経由)。代入するたびに全体を置き換える */
  get options(): Options {
    return this.#props
  }
  set options(next: Options) {
    this.#props = { ...next }
    this.#apply()
  }

  /** 今の引力行列。代入すると属性の matrix より優先される */
  get matrix(): Matrix {
    return this.#controller?.matrix ?? []
  }
  set matrix(m: Matrix) {
    this.options = { ...this.#props, matrix: m }
  }

  get controller(): Controller | null {
    return this.#controller
  }

  shuffle() {
    this.#controller?.shuffle()
  }
  respawn() {
    this.#controller?.respawn()
  }
  pause() {
    this.toggleAttribute('paused', true)
  }
  resume() {
    this.removeAttribute('paused')
  }
}

/** 別のタグ名で使いたいとき用。同じクラスは 1 度しか登録できないので、名前ごとに派生させる */
export const defineParticleLifeBg = (tag = TAG_NAME) => {
  if (typeof customElements === 'undefined' || customElements.get(tag)) return
  customElements.define(
    tag,
    tag === TAG_NAME
      ? ParticleLifeBgElement
      : class extends ParticleLifeBgElement {}
  )
}

defineParticleLifeBg()

declare global {
  interface HTMLElementTagNameMap {
    'particle-life-bg': ParticleLifeBgElement
  }
}
