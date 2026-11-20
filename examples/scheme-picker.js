// 配色の選択肢を「その配色で描いたときの縮図」で並べる。名前と色見本だけでは、地との対比や種類数ぶんの色の並びが想像しにくいため

const THUMB_W = 136
const THUMB_H = 64
// 種類ごとに小さな塊を作って散らす数。本物の模様 (細胞・鎖) に近い見え方にするため一様乱数ではなく塊にする
const CLUSTERS_PER_TYPE = 2
const DOTS_PER_CLUSTER = 9
const CLUSTER_SPREAD = 7
const DOT_RADIUS = 1.6
// 毎回同じ配置で描き、配色だけを見比べられるようにする
const LAYOUT_SEED = 7

const seeded = (seed) => {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const drawThumb = (canvas, scheme, types) => {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = THUMB_W * dpr
  canvas.height = THUMB_H * dpr
  const g = canvas.getContext('2d')
  if (!g) return
  g.scale(dpr, dpr)
  g.fillStyle = scheme.bg
  g.fillRect(0, 0, THUMB_W, THUMB_H)
  // 暗い地では実際の描画と同じく加算合成で重ね、光の混ざり方も見せる
  g.globalCompositeOperation = scheme.isLight ? 'source-over' : 'lighter'
  const rng = seeded(LAYOUT_SEED)
  for (let t = 0; t < types; t++) {
    g.fillStyle = scheme.color(t, types)
    for (let c = 0; c < CLUSTERS_PER_TYPE; c++) {
      const cx = rng() * THUMB_W
      const cy = rng() * THUMB_H
      for (let k = 0; k < DOTS_PER_CLUSTER; k++) {
        const angle = rng() * Math.PI * 2
        const r = rng() * CLUSTER_SPREAD
        g.beginPath()
        g.arc(
          cx + Math.cos(angle) * r,
          cy + Math.sin(angle) * r,
          DOT_RADIUS,
          0,
          Math.PI * 2
        )
        g.fill()
      }
    }
  }
}

const swatches = (scheme, types) => {
  const strip = document.createElement('span')
  strip.className = 'scheme-strip'
  for (let t = 0; t < types; t++) {
    const s = document.createElement('i')
    s.style.background = scheme.color(t, types)
    strip.append(s)
  }
  return strip
}

/**
 * @param {HTMLElement} root
 * @param {{ schemes: Record<string, any>, onChange: (id: string) => void }} opts
 */
export const createSchemePicker = (root, { schemes, onChange }) => {
  const render = (selected, types) => {
    root.replaceChildren(
      ...Object.entries(schemes).map(([id, scheme]) => {
        const b = document.createElement('button')
        const canvas = document.createElement('canvas')
        const name = document.createElement('span')
        b.type = 'button'
        b.className = 'scheme-card'
        b.setAttribute('aria-pressed', String(id === selected))
        b.title = id
        name.className = 'scheme-name'
        name.textContent = scheme.name
        drawThumb(canvas, scheme, types)
        b.append(canvas, name, swatches(scheme, types))
        b.onclick = () => onChange(id)
        return b
      })
    )
  }
  return { render }
}
