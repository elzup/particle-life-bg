// 引力行列のセルを上下ドラッグ / ホイールで -1〜1 に調整する。ダブルクリックで 0

// 1px ドラッグあたりの変化量。セル 1 つ分 (約 30px) 動かすと 0.3 変わる
const DRAG_PER_PX = 0.01
const WHEEL_STEP = 0.05
// 行見出し (縦帯) の列幅。列見出しの帯の太さとそろえる
const ROW_HEAD_PX = 8

const clamp = (v) => Math.max(-1, Math.min(1, v))

const cellColor = (v) => {
  // 正 (引かれる) は緑、負 (避ける) は赤。強さを彩度ではなく不透明度で出す
  const hue = v >= 0 ? 140 : 0
  return `hsl(${hue} 70% 45% / ${Math.abs(v)})`
}

/**
 * @param {HTMLElement} root
 * @param {{ colorOf: (t: number) => string, onChange: (m: number[][]) => void }} opts
 */
export const createMatrixEditor = (root, { colorOf, onChange }) => {
  let matrix = []

  const paint = (el, i, j) => {
    const v = matrix[i]?.[j] ?? 0
    el.style.background = cellColor(v)
    el.textContent = v.toFixed(1)
    el.title = `${i} → ${j}: ${v.toFixed(2)}`
  }

  // ドラッグ中に作り直すと pointer capture が外れるので、そのセルだけ塗り直す
  const update = (el, i, j, value) => {
    matrix = matrix.map((row, r) =>
      r === i ? row.map((v, c) => (c === j ? clamp(value) : v)) : row
    )
    paint(el, i, j)
    onChange(matrix)
  }

  // 列見出しは横帯、行見出しは縦帯。行側を横帯にすると左の列が 1 マスぶん幅を取ってセルが小さくなる
  const header = (t, axis) => {
    const el = document.createElement('div')
    el.className = `mx-head mx-head-${axis}`
    el.style.background = colorOf(t)
    return el
  }

  const cell = (i, j) => {
    const el = document.createElement('div')
    const current = () => matrix[i]?.[j] ?? 0
    el.className = 'mx-cell'
    paint(el, i, j)
    el.onwheel = (e) => {
      e.preventDefault()
      update(el, i, j, current() + (e.deltaY < 0 ? WHEEL_STEP : -WHEEL_STEP))
    }
    el.ondblclick = () => update(el, i, j, 0)
    el.onpointerdown = (e) => {
      const startY = e.clientY
      const startV = current()
      el.setPointerCapture(e.pointerId)
      el.onpointermove = (m) =>
        update(el, i, j, startV + (startY - m.clientY) * DRAG_PER_PX)
      el.onpointerup = () => {
        el.onpointermove = null
      }
    }
    return el
  }

  const render = (next) => {
    matrix = next
    const n = matrix.length
    root.style.gridTemplateColumns = `${ROW_HEAD_PX}px repeat(${n}, 1fr)`
    root.replaceChildren(
      document.createElement('div'),
      ...matrix.map((_, j) => header(j, 'col')),
      ...matrix.flatMap((row, i) => [
        header(i, 'row'),
        ...row.map((_, j) => cell(i, j)),
      ])
    )
  }

  return { render }
}
