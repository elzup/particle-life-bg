// パラメーター調整 → 1 画面プレビュー (フォーマット切替) → コード生成 → 負荷見積もり
import {
  COLOR_SCHEMES,
  DEFAULTS,
  DRAW_STYLES,
  toAttributes,
} from '../lib/esm/index.js'
import {
  BASE_DEFAULTS,
  toHtml,
  toJson,
  toOptions,
  toReact,
  toVanilla,
} from './codegen.js'
import { applyStatic, LANGS, labelParam, lang, switchLang, t } from './i18n.js'
import { createMatrixEditor } from './matrix-editor.js'
import { estimate, FORMATS, rate, stars } from './perf.js'
import { createSchemePicker } from './scheme-picker.js'
import { createStage } from './stage.js'

const $ = (id) => document.getElementById(id)
const MATRIX_PRESETS = ['random', 'symmetric', 'snake', 'zero']
// seed の上限。URL に載せても邪魔にならない桁数
const SEED_RANGE = 100000
// 実測値を読む間隔。preview 側の計測窓 (1 秒) と揃える
const METER_INTERVAL_MS = 1000
// copy ボタンの表示を戻すまで。押せたことが目で追える長さ
const COPY_FEEDBACK_MS = 1200

const RANGES = [
  { key: 'count', min: 100, max: 5000, step: 100 },
  { key: 'types', min: 2, max: 12, step: 1 },
  { key: 'rMax', min: 0.02, max: 0.3, step: 0.005 },
  { key: 'friction', min: 0.005, max: 0.2, step: 0.005 },
  { key: 'force', min: 1, max: 30, step: 0.5 },
]

const repeatTo = (list, n) =>
  Array.from({ length: n }, (_, i) => list[i % list.length] ?? 'dots')

const initialState = () => ({
  ...BASE_DEFAULTS,
  ...DEFAULTS,
  seed: Math.floor(Math.random() * SEED_RANGE),
  drawStyle: repeatTo(['dots'], DEFAULTS.types),
  colors: undefined,
  background: undefined,
})

/** URL hash (toOptions の JSON) から状態を戻す。共有リンク用 */
const fromHash = (base) => {
  try {
    const raw = decodeURIComponent(location.hash.slice(1))
    if (raw === '') return base
    const o = JSON.parse(raw)
    const types = Array.isArray(o.matrix)
      ? o.matrix.length
      : (o.types ?? base.types)
    const styles = o.drawStyle === undefined ? ['dots'] : [o.drawStyle].flat()

    return {
      ...base,
      ...o,
      types,
      seed: o.seed,
      drawStyle: repeatTo(styles, types),
    }
  } catch (e) {
    console.error('playground: URL hash を読めなかったので既定値で始める', e)
    return base
  }
}

let state = fromHash(initialState())
let formatId = 'desktop'
let codeTab = 'html'
// 生成する CDN URL に埋める版。取れなければ利用者に書き換えてもらう印を残す
const pkgVersion = await fetch('../package.json')
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
  .then((pkg) => pkg.version)
  .catch((e) => {
    console.error('playground: package.json を読めなかった', e)
    return '<version>'
  })
let preview = null

const libOptions = (s) => ({
  types: s.types,
  count: s.count,
  matrix: s.matrix,
  seed: s.seed,
  rMax: s.rMax,
  friction: s.friction,
  force: s.force,
  drawStyle: s.drawStyle,
  scheme: s.scheme,
  colors: s.colors,
  background: s.background,
  fps: s.fps,
  respectReducedMotion: false,
})

// ---- コントロール ----

const fillSelect = (el, values, value) => {
  el.replaceChildren(
    ...values.map((v) => {
      const o = document.createElement('option')
      o.value = String(v)
      o.textContent = String(v)
      return o
    })
  )
  el.value = String(value)
}

const buildRanges = () => {
  $('ranges').replaceChildren(
    ...RANGES.map((r) => {
      const row = document.createElement('label')
      const name = document.createElement('span')
      const input = document.createElement('input')
      const out = document.createElement('output')
      row.className = 'row'
      labelParam(name, r.key)
      Object.assign(input, {
        type: 'range',
        min: r.min,
        max: r.max,
        step: r.step,
      })
      input.id = `r-${r.key}`
      out.id = `o-${r.key}`
      input.oninput = () => setRange(r.key, Number(input.value))
      row.append(name, input, out)
      return row
    })
  )
}

// 種類ごとの描き方は 8 択を一目で比べられるよう、select ではなく 1 行の radio (短い記号) で並べる
const styleRadio = (type, style, current) => {
  const label = document.createElement('label')
  const input = document.createElement('input')
  const text = document.createElement('span')
  input.type = 'radio'
  input.name = `draw-style-${type}`
  input.value = style
  input.checked = style === current
  input.onchange = () =>
    commit({
      drawStyle: state.drawStyle.map((s, i) => (i === type ? style : s)),
    })
  text.textContent = t(`style.${style}.short`)
  label.className = 'seg'
  label.title = `${style}: ${t(`style.${style}.name`)}`
  label.append(input, text)
  return label
}

const buildStyleRows = () => {
  $('styles').replaceChildren(
    ...state.drawStyle.map((current, type) => {
      const row = document.createElement('div')
      const chip = document.createElement('span')
      const group = document.createElement('div')
      chip.className = 'chip'
      chip.style.background = schemeColor(type)
      group.className = 'segs'
      group.setAttribute('aria-label', `type ${type}`)
      group.append(...DRAW_STYLES.map((s) => styleRadio(type, s, current)))
      row.className = 'style-row'
      row.append(chip, group)
      return row
    })
  )
  $('style-legend').textContent = DRAW_STYLES.map(
    (s) => `${t(`style.${s}.short`)}: ${t(`style.${s}.name`)}`
  ).join(' / ')
}

const schemePicker = createSchemePicker($('schemes'), {
  schemes: COLOR_SCHEMES,
  // 配色を選び直したら、その配色の色で始め直す (手で選んだ色を残すと配色を選んだ意味が見えない)
  onChange: (id) => commit({ scheme: id, colors: undefined }),
})
// 縮図は配色と種類数でしか変わらないので、スライダー操作のたびに描き直さない
let schemePickerKey = ''
const syncSchemePicker = () => {
  const key = `${state.scheme}:${state.types}`
  if (key === schemePickerKey) return
  schemePickerKey = key
  schemePicker.render(state.scheme, state.types)
}

// input type=color は #rrggbb しか受け付けないので、配色の hsl() などを canvas に解釈させて直す
const hexCtx = document.createElement('canvas').getContext('2d')
const toHex = (color) => {
  hexCtx.fillStyle = '#000000'
  hexCtx.fillStyle = color
  const v = String(hexCtx.fillStyle)
  return /^#[0-9a-f]{6}$/i.test(v) ? v : '#ffffff'
}

/** 種類 t の実際の色 (colors の上書き > 配色) */
const schemeColor = (t) =>
  state.colors?.length
    ? state.colors[t % state.colors.length]
    : COLOR_SCHEMES[state.scheme].color(t, state.types)

const buildColorRow = () => {
  const root = $('colors')
  // 色を選んでいる最中に input を作り直すとピッカーが閉じるので、数が同じなら値だけ合わせる
  if (root.children.length === state.types) {
    for (const [i, input] of [...root.children].entries()) {
      if (input !== document.activeElement) input.value = toHex(schemeColor(i))
    }
    $('reset-colors').hidden = !state.colors?.length
    return
  }
  root.replaceChildren(
    ...Array.from({ length: state.types }, (_, type) => {
      const input = document.createElement('input')
      input.type = 'color'
      input.value = toHex(schemeColor(type))
      input.title = `type ${type}`
      input.setAttribute('aria-label', `type ${type}`)
      // 1 色だけ変えても全種類ぶんを持つ (配色の色を起点に、その 1 色を差し替える)
      input.oninput = () =>
        commit({
          colors: Array.from({ length: state.types }, (_, i) =>
            i === type ? input.value : toHex(schemeColor(i))
          ),
        })
      return input
    })
  )
  $('reset-colors').hidden = !state.colors?.length
}

const syncControls = () => {
  for (const r of RANGES) {
    $(`r-${r.key}`).value = String(state[r.key])
    $(`o-${r.key}`).textContent = String(state[r.key])
  }
  syncSchemePicker()
  $('fps').value = String(state.fps)
  $('matrix').value = Array.isArray(state.matrix) ? 'custom' : state.matrix
  $('seed').value = state.seed === undefined ? '' : String(state.seed)
  $('bg-mode').value =
    state.background === undefined
      ? 'scheme'
      : state.background === 'transparent'
        ? 'transparent'
        : 'color'
  $('bg-color').disabled = $('bg-mode').value !== 'color'
  if ($('bg-mode').value === 'color') $('bg-color').value = state.background
  buildStyleRows()
  buildColorRow()
}

const setRange = (key, value) => {
  if (key !== 'types') return commit({ [key]: value })
  // 種類数が変わると手で編集した行列は大きさが合わないのでプリセットに戻す
  commit({
    types: value,
    drawStyle: repeatTo(state.drawStyle, value),
    matrix: Array.isArray(state.matrix) ? 'random' : state.matrix,
  })
}

const bindControls = () => {
  fillSelect($('fps'), [60, 30, 24, 15], state.fps)
  fillSelect($('matrix'), [...MATRIX_PRESETS, 'custom'], 'random')
  fillSelect($('style-all'), [t('perType'), ...DRAW_STYLES], t('perType'))
  $('fps').onchange = (e) => commit({ fps: Number(e.target.value) })
  $('matrix').onchange = (e) => {
    if (e.target.value !== 'custom') commit({ matrix: e.target.value })
  }
  $('style-all').onchange = (e) => {
    if (DRAW_STYLES.includes(e.target.value))
      commit({ drawStyle: repeatTo([e.target.value], state.types) })
    e.target.value = t('perType')
  }
  $('seed').onchange = (e) =>
    commit({ seed: e.target.value === '' ? undefined : Number(e.target.value) })
  $('shuffle').onclick = () =>
    commit({
      seed: Math.floor(Math.random() * SEED_RANGE),
      matrix: Array.isArray(state.matrix) ? 'random' : state.matrix,
    })
  $('respawn').onclick = () => preview?.bg.respawn()
  $('bg-mode').onchange = (e) => {
    const mode = e.target.value
    commit({
      background:
        mode === 'scheme'
          ? undefined
          : mode === 'transparent'
            ? 'transparent'
            : toHex(COLOR_SCHEMES[state.scheme].bg),
    })
  }
  $('bg-color').oninput = (e) => commit({ background: e.target.value })
  $('reset-colors').onclick = () => commit({ colors: undefined })
  $('sample').onchange = (e) => preview?.setSample(e.target.checked)
  $('reset').onclick = () => {
    state = initialState()
    applyAll()
  }
}

// ---- 行列 ----

const matrixEditor = createMatrixEditor($('mx'), {
  colorOf: (t) => schemeColor(t),
  // 編集中は editor 自身がセルを塗るので作り直さない
  onChange: (m) => commit({ matrix: m }, { isFromEditor: true }),
})

const refreshMatrix = () => {
  if (preview) matrixEditor.render(preview.bg.matrix)
}

// ---- 状態の反映 ----

const commit = (patch, { isFromEditor = false } = {}) => {
  state = { ...state, ...patch }
  preview?.bg.setOptions(libOptions(state), 'replace')
  if (!isFromEditor) {
    syncControls()
    refreshMatrix()
  } else {
    $('matrix').value = 'custom'
  }
  renderOutputs()
}

const applyAll = () => {
  syncControls()
  preview?.bg.setOptions(libOptions(state), 'replace')
  refreshMatrix()
  renderOutputs()
}

const renderOutputs = () => {
  const opts = toOptions(state)
  const gen = {
    html: (o) => toHtml(o, toAttributes, pkgVersion),
    vanilla: toVanilla,
    react: toReact,
    json: toJson,
  }[codeTab]
  $('code').textContent = gen(opts)
  history.replaceState(null, '', `#${encodeURIComponent(JSON.stringify(opts))}`)
  renderPerf()
}

// ---- 負荷 ----

// 端末名は製品名 (Desktop 等) なら訳さず、日本語ラベルのものだけ訳を持つ
const formatLabel = (f) => {
  const key = `format.${f.id}`
  const translated = t(key)
  return translated === key ? f.label : translated
}

const currentFormat = () => {
  if (formatId !== 'fit') return FORMATS.find((f) => f.id === formatId)
  const rect = $('stage').getBoundingClientRect()
  return {
    id: 'fit',
    label: 'Fit',
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    dpr: window.devicePixelRatio || 1,
    cpu: 1,
  }
}

const renderPerf = () => {
  const rows = [
    currentFormat(),
    ...FORMATS.filter((f) => f.id !== formatId),
  ].map((f) => {
    const e = estimate(state, f)
    const tr = document.createElement('tr')
    const cells = [
      formatLabel(f),
      `${f.width}×${f.height} @${f.dpr}x${f.screens ? ` (${t('screens', { n: f.screens })})` : ''}`,
      stars(e.stars),
      t(`rate.${e.stars}`),
      `${(e.load * 100).toFixed(1)}%`,
      `${e.frameMs.toFixed(2)} ms`,
      `${Math.round(e.simShare * 100)}%`,
    ]
    tr.className = `stars-${e.stars}${f.id === formatId ? ' is-current' : ''}`
    tr.replaceChildren(
      ...cells.map((text) => {
        const td = document.createElement('td')
        td.textContent = text
        return td
      })
    )
    tr.onclick = () => selectFormat(f.id)
    return tr
  })
  $('perf-body').replaceChildren(...rows)
}

const renderMeter = () => {
  if (!preview) return
  const load = preview.meter.load
  const r = rate(load)
  $('meter').textContent = t('meter', {
    format: formatLabel(currentFormat()),
    cpu: (load * 100).toFixed(1),
    stars: stars(r.stars),
    label: t(`rate.${r.stars}`),
  })
}

// ---- フォーマット / コード切替 ----

const stage = createStage($('stage'), (p) => {
  preview = p
  p.setSample($('sample').checked)
  applyAll()
})

const markActive = (container, attr, value) => {
  for (const b of container.querySelectorAll('button'))
    b.classList.toggle('is-active', b.dataset[attr] === value)
}

const selectFormat = (id) => {
  formatId = id
  stage.setFormat(
    id === 'fit' ? null : (FORMATS.find((f) => f.id === id) ?? null)
  )
  markActive($('formats'), 'format', id)
  renderPerf()
}

const buildFormatTabs = () => {
  $('formats').replaceChildren(
    ...[{ id: 'fit', label: 'Fit' }, ...FORMATS].map((f) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.dataset.format = f.id
      b.textContent = formatLabel(f)
      b.onclick = () => selectFormat(f.id)
      return b
    })
  )
}

const bindCodeTabs = () => {
  for (const b of $('code-tabs').querySelectorAll('button')) {
    b.onclick = () => {
      codeTab = b.dataset.tab
      markActive($('code-tabs'), 'tab', codeTab)
      renderOutputs()
    }
  }
  markActive($('code-tabs'), 'tab', codeTab)
  $('copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText($('code').textContent ?? '')
      $('copy').textContent = 'copied'
    } catch (e) {
      console.error('playground: clipboard に書けなかった', e)
      $('copy').textContent = 'failed'
    }
    setTimeout(() => {
      $('copy').textContent = 'copy'
    }, COPY_FEEDBACK_MS)
  }
}

const buildLangTabs = () => {
  $('langs').replaceChildren(
    ...LANGS.map((l) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.dataset.lang = l
      b.textContent = l
      b.onclick = () => l !== lang && switchLang(l)
      return b
    })
  )
  markActive($('langs'), 'lang', lang)
}

applyStatic()
buildLangTabs()
buildRanges()
bindControls()
buildFormatTabs()
bindCodeTabs()
selectFormat(formatId)
syncControls()
renderOutputs()
setInterval(renderMeter, METER_INTERVAL_MS)
