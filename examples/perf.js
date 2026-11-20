// 画面フォーマットごとの負荷を、描かずに式だけで見積もる (複数を同時に描くと重いので)

/**
 * cpu: 手元のデスクトップを 1 としたときの遅さ。スマホは JS もラスタも数倍遅い
 * dpr: その端末の devicePixelRatio (maxPixelRatio で頭打ちになる)
 */
// ページ背景として使う端末は、スクロールぶんも含めた縦の長さで見積もる (要素の高さ = 文書全体)。
// LP や記事 1 本でおおよそ 3 画面ぶん
const PAGE_SCREENS = 3
const page = (f) => ({
  ...f,
  height: f.height * PAGE_SCREENS,
  screens: PAGE_SCREENS,
})

export const FORMATS = [
  page({
    id: 'desktop',
    label: 'Desktop',
    width: 1440,
    height: 900,
    dpr: 2,
    cpu: 1,
  }),
  page({
    id: 'laptop',
    label: 'Laptop',
    width: 1280,
    height: 720,
    dpr: 1,
    cpu: 1.5,
  }),
  page({
    id: 'tablet',
    label: 'Tablet',
    width: 820,
    height: 1180,
    dpr: 2,
    cpu: 2,
  }),
  page({
    id: 'mobile',
    label: 'Mobile',
    width: 390,
    height: 844,
    dpr: 3,
    cpu: 3,
  }),
  { id: 'banner', label: 'Banner', width: 1200, height: 300, dpr: 2, cpu: 1 },
  { id: 'og', label: 'OG 画像', width: 1200, height: 630, dpr: 1, cpu: 1 },
  {
    id: 'uhd',
    label: '4K サイネージ',
    width: 3840,
    height: 2160,
    dpr: 1,
    cpu: 1,
  },
]

// 1 操作あたりの所要時間 (ns)。デスクトップ Chrome で既定設定を動かしたときの体感に合わせた概算で、桁が合う程度の精度
const COST_NS = {
  pair: 4, // 近傍候補 1 組の距離計算と力の加算
  dot: 60, // fillRect 1 回
  sprite: 350, // 28px の光スプライトを加算合成で drawImage
  streak: 40, // path の線分 1 本
  linkPair: 2, // links の同種ペア距離判定
  fillPx: 0.15, // 画面全体の塗り 1 px
}
// speedGlow / crowdGlow で光スプライトまで描かれる粒子の割合 (速い・混んだ上位だけが光る)
const GLOW_SHARE = 0.3
// 近傍探索は自セル + 周囲 8 セル
const NEIGHBOR_CELLS = 9

const STYLE_NS = {
  dots: COST_NS.dot,
  trail: COST_NS.dot,
  mono: COST_NS.dot,
  glow: COST_NS.sprite,
  streak: COST_NS.streak,
  links: COST_NS.dot,
  speedGlow: COST_NS.dot + COST_NS.sprite * GLOW_SHARE,
  crowdGlow: COST_NS.dot + COST_NS.sprite * GLOW_SHARE,
}

// 1 コアに対する占有率で段階分け。背景は他の処理の邪魔をしない 1 割前後に収めたい
const RATING_STEPS = [
  { max: 0.05, stars: 5, label: '軽い' },
  { max: 0.12, stars: 4, label: '問題なし' },
  { max: 0.25, stars: 3, label: 'やや重い' },
  { max: 0.5, stars: 2, label: '重い' },
]
const WORST = { max: Number.POSITIVE_INFINITY, stars: 1, label: 'カクつく恐れ' }

const simNs = (count, aspect, rMax) => {
  const cells =
    Math.max(1, Math.floor(aspect / rMax)) * Math.max(1, Math.floor(1 / rMax))
  const perCell = count / cells

  return count * Math.min(count, NEIGHBOR_CELLS * perCell) * COST_NS.pair
}

const drawNs = (state, pixels) => {
  const styles = state.drawStyle.slice(0, state.types)
  const perType = state.count / state.types
  const particles = styles.reduce((sum, s) => sum + perType * STYLE_NS[s], 0)
  const links = styles.filter((s) => s === 'links').length
  const linkPairs = links * ((perType * perType) / 2) * COST_NS.linkPair
  // 地の塗り 1 回 + trail があれば残像レイヤーを薄める塗りと重ねる drawImage で 2 回
  const fills = 1 + (styles.includes('trail') ? 2 : 0)

  return particles + linkPairs + fills * pixels * COST_NS.fillPx
}

export const rate = (load) => RATING_STEPS.find((r) => load < r.max) ?? WORST

/** format の端末で state を動かしたときの 1 コア占有率の見積もり */
export const estimate = (state, format, maxPixelRatio = 2) => {
  const dpr = Math.min(format.dpr, maxPixelRatio)
  const pixels = format.width * format.height * dpr * dpr
  const sim = simNs(state.count, format.width / format.height, state.rMax)
  const draw = drawNs(state, pixels)
  const frameMs = ((sim + draw) / 1e6) * format.cpu
  const load = (frameMs * state.fps) / 1000

  return {
    frameMs,
    load,
    simShare: sim / (sim + draw),
    megapixels: pixels / 1e6,
    ...rate(load),
  }
}

export const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n)
