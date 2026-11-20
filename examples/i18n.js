// playground の表示言語 (ja 既定 / en)。?lang= > 前回の選択 > ja の順で決める。
// 識別子そのもの (count, rMax, drawStyle などオプション名) はコードと一致させるため訳さない

const STORAGE_KEY = 'particle-life-bg:lang'
export const LANGS = ['ja', 'en']

// ja のときだけパラメーター名を日本語にする。en はオプション名そのもの (生成コードと見比べられる)
const PARAM_JA = {
  count: '粒子数',
  types: '種類数',
  rMax: '届く距離',
  friction: '摩擦 (半減期)',
  force: '力の強さ',
  fps: '更新頻度',
  matrix: '行列',
  seed: '乱数の種',
  scheme: '配色',
  background: '背景',
  drawStyle: '描き方',
  colors: '色',
}

const MESSAGES = {
  ja: {
    simulation: 'シミュレーション',
    matrixTitle: '引力行列',
    seedPlaceholder: '(毎回ランダム)',
    shuffle: 'shuffle (新しい seed)',
    respawn: '撒き直す',
    matrixHint:
      '行 i が列 j に引かれる強さ。上下ドラッグ / ホイールで調整、ダブルクリックで 0。編集すると matrix=custom',
    drawing: '描画',
    bgScheme: 'scheme の地',
    bgColor: '色指定',
    sample: 'サンプル文字を重ねる',
    reset: '既定値に戻す',
    resetColors: '配色に戻す',
    colorsHint:
      '種類ごとの色。押すと色を選べる。配色を選び直すと配色の色に戻る',
    codeHint:
      '既定値と同じものは省略。URL にも同じ設定が入るので、そのまま共有できる',
    perfTitle: '負荷の見積もり',
    thFormat: 'format',
    thSize: 'size',
    thRating: '評価',
    thRatio: 'sim 比',
    measuring: '実測: 計測中…',
    perfHint:
      'CPU = 1 コア占有率の概算 (近傍探索 + 描画 + 全面塗り)。端末ごとの dpr (maxPixelRatio=2 で頭打ち) と CPU 性能差を掛けた式で、桁が合う程度の目安。ページ用の端末はスクロール込み (3 画面分) の高さ。実測は今表示中の 1 画面だけ、この PC で rAF コールバックに掛かった時間 (GPU 合成は含まない)。行クリックで切替',
    perType: '(種類ごと)',
    screens: ({ n }) => `${n} 画面`,
    meter: ({ format, cpu, stars, label }) =>
      `実測 (このPC・${format}): CPU ${cpu}% ${stars} ${label}`,
    'rate.5': '軽い',
    'rate.4': '問題なし',
    'rate.3': 'やや重い',
    'rate.2': '重い',
    'rate.1': 'カクつく恐れ',
    'format.og': 'OG 画像',
    'format.uhd': '4K サイネージ',
    'style.dots.short': '点',
    'style.dots.name': 'ドット',
    'style.glow.short': '光',
    'style.glow.name': '発光 (加算合成)',
    'style.trail.short': '残',
    'style.trail.name': '残像',
    'style.streak.short': '筋',
    'style.streak.name': '速度の筋',
    'style.links.short': '線',
    'style.links.name': '近傍を結ぶ',
    'style.mono.short': '淡',
    'style.mono.name': '淡いモノトーン',
    'style.speedGlow.short': '速',
    'style.speedGlow.name': '速いほど発光',
    'style.crowdGlow.short': '密',
    'style.crowdGlow.name': '近傍が多いほど発光',
  },
  en: {
    simulation: 'Simulation',
    matrixTitle: 'Attraction matrix',
    seedPlaceholder: '(random each time)',
    shuffle: 'shuffle (new seed)',
    respawn: 'respawn',
    matrixHint:
      'How strongly row i is pulled toward column j. Drag up/down or scroll to adjust, double-click for 0. Editing switches to matrix=custom',
    drawing: 'Drawing',
    bgScheme: 'scheme background',
    bgColor: 'custom color',
    sample: 'Overlay sample text',
    reset: 'Reset to defaults',
    resetColors: 'Use scheme colors',
    colorsHint:
      'One color per type. Click to pick. Choosing a scheme resets them',
    codeHint:
      'Values equal to the defaults are omitted. The URL carries the same settings, so you can share it as is',
    perfTitle: 'Load estimate',
    thFormat: 'format',
    thSize: 'size',
    thRating: 'rating',
    thRatio: 'sim share',
    measuring: 'Measured: measuring…',
    perfHint:
      'CPU = rough share of one core (neighbour search + drawing + full-canvas fills), scaled by each device’s dpr (capped by maxPixelRatio=2) and CPU speed. Good to an order of magnitude. Page-type devices use the full scroll height (3 screens). “Measured” covers only the format shown, as time spent in rAF callbacks on this machine (GPU compositing excluded). Click a row to switch',
    perType: '(per type)',
    screens: ({ n }) => `${n} screens`,
    meter: ({ format, cpu, stars, label }) =>
      `Measured (this machine, ${format}): CPU ${cpu}% ${stars} ${label}`,
    'rate.5': 'light',
    'rate.4': 'fine',
    'rate.3': 'a bit heavy',
    'rate.2': 'heavy',
    'rate.1': 'may stutter',
    'format.og': 'OG image',
    'format.uhd': '4K signage',
    'style.dots.short': 'dot',
    'style.dots.name': 'dots',
    'style.glow.short': 'glw',
    'style.glow.name': 'glow (additive)',
    'style.trail.short': 'trl',
    'style.trail.name': 'trail',
    'style.streak.short': 'stk',
    'style.streak.name': 'velocity streak',
    'style.links.short': 'lnk',
    'style.links.name': 'links to neighbours',
    'style.mono.short': 'mon',
    'style.mono.name': 'faint mono',
    'style.speedGlow.short': 'spd',
    'style.speedGlow.name': 'glow by speed',
    'style.crowdGlow.short': 'crd',
    'style.crowdGlow.name': 'glow by crowding',
  },
}

// 保存領域が使えない環境 (プライベートウィンドウ等) でも ja で動けばよいので、失敗は既定に倒す
const readStored = () => {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

const detect = () => {
  const fromQuery = new URLSearchParams(location.search).get('lang')
  const pick = fromQuery ?? readStored()
  return LANGS.includes(pick) ? pick : 'ja'
}

export const lang = detect()

/** key の訳。関数の訳には vars を渡す。訳が無ければ ja、それも無ければ key をそのまま */
export const t = (key, vars = {}) => {
  const m = MESSAGES[lang][key] ?? MESSAGES.ja[key] ?? key
  return typeof m === 'function' ? m(vars) : m
}

/** パラメーターの表示名。ja は日本語、en はオプション名のまま */
export const paramLabel = (name) =>
  lang === 'ja' ? (PARAM_JA[name] ?? name) : name

/** 表示名を入れる。ja ではオプション名をふりがな (ruby) で添え、生成コードの名前と対応が付くようにする */
export const labelParam = (el, name) => {
  const label = paramLabel(name)
  if (label === name) {
    el.textContent = name
    return
  }
  const ruby = document.createElement('ruby')
  const rt = document.createElement('rt')
  rt.textContent = name
  ruby.append(label, rt)
  el.replaceChildren(ruby)
}

/** data-i18n (textContent) / data-i18n-placeholder / data-param を埋め、<html lang> を合わせる */
export const applyStatic = (root = document) => {
  document.documentElement.lang = lang
  for (const el of root.querySelectorAll('[data-i18n]'))
    el.textContent = t(el.dataset.i18n)
  for (const el of root.querySelectorAll('[data-i18n-placeholder]'))
    el.placeholder = t(el.dataset.i18nPlaceholder)
  for (const el of root.querySelectorAll('[data-param]'))
    labelParam(el, el.dataset.param)
}

/** 言語を切り替える。全 UI を作り直すより確実なので、保存して読み込み直す (状態は URL hash に残る) */
export const switchLang = (next) => {
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch (e) {
    console.error('playground: 言語設定を保存できなかった', e)
  }
  const url = new URL(location.href)
  url.searchParams.set('lang', next)
  location.href = url.toString()
}
